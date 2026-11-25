'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BadgeCheck,
  BellRing,
  Copy,
  Loader2,
  Pause,
  Play,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import {
  BILLING_STATE_LABELS,
  describeOffsets,
  describeStep,
  remindersRunning,
  type BillingReminderState,
} from '@/lib/billing/schedule'
import {
  BILLING_MESSAGE_STATUS_LABELS,
  MIN_BILLING_AMOUNT_CENTS,
  type BillingPanel,
  type BillingPanelItem,
} from '@/types/billing.types'
import { clientDisplayName } from '@/lib/billing/entries'
import {
  BILLING_PANEL_FILTERS,
  matchesBillingFilter,
  type BillingPanelFilter,
} from '@/lib/billing/panelFilters'
import { formatCurrency, type FinancialEntryWithRelations } from '@/types/financialEntry.types'
import { useBillingPanel } from '../hooks/useBillings'
import {
  useEnableRemindersBatch,
  useMarkPaidOutside,
  useUpdateBilling,
} from '../hooks/usePaymentChargeMutations'
import { BillingSeriesCard } from './BillingSeriesCard'
import { ReminderActions } from './ReminderActions'

function shortDate(isoDate: string): string {
  return format(parseISO(isoDate), 'dd/MM', { locale: ptBR })
}

function shortMoment(iso: string): string {
  return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR })
}

const STATE_TONES: Record<BillingReminderState, string> = {
  paid: 'bg-success/10 text-success',
  closed: 'bg-muted text-muted-foreground',
  link_only: 'bg-muted text-muted-foreground',
  opted_out: 'bg-muted text-muted-foreground',
  paused: 'bg-warning/10 text-warning',
  no_due_date: 'bg-muted text-muted-foreground',
  ended: 'bg-destructive/10 text-destructive',
  due_today: 'bg-warning/10 text-warning',
  overdue: 'bg-destructive/10 text-destructive',
  scheduled: 'bg-info/10 text-info',
}

export function BillingStateBadge({ state }: { state: BillingReminderState }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        STATE_TONES[state],
      )}
    >
      {BILLING_STATE_LABELS[state]}
    </span>
  )
}

/** O valor de hoje; com multa e juros, o original embaixo (migration 97). */
function AmountToday({ item }: { item: BillingPanelItem }) {
  const today = item.amountToday
  const updated = item.entry.status === 'pendente' && today.totalCents > today.principalCents
  return (
    <span className="shrink-0 text-right">
      <span className="block text-sm font-bold tabular-nums">
        {formatCurrency(updated ? today.totalCents / 100 : item.entry.amount)}
      </span>
      {updated && (
        <span className="block text-[11px] text-muted-foreground tabular-nums">
          original {formatCurrency(item.entry.amount)}
        </span>
      )}
    </span>
  )
}

function clientLabel(item: BillingPanelItem): string {
  return item.client?.displayName ?? 'Sem cliente'
}

/**
 * A aba Cobranças do Financeiro (fase 2 de docs/cobrancas.md): a fila do dia,
 * todas as cobranças com a situação da régua, e o lote para ligar lembretes.
 *
 * Tudo calculado no servidor pela mesma régua do cron (`/api/financeiro/
 * cobrancas/painel`); a tela só mostra e manda as ações pelas rotas.
 */
export function BillingsPanel({
  entries,
  onOpenEntry,
}: {
  /** Os lançamentos que a tela já carregou — o lote sai deles. */
  entries: FinancialEntryWithRelations[]
  onOpenEntry: (entryId: string) => void
}) {
  const { can } = usePermissions()
  const panel = useBillingPanel()
  const [filter, setFilter] = useState<BillingPanelFilter>('running')

  if (panel.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (panel.isError || !panel.data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar as cobranças.{' '}
          <button type="button" className="underline" onClick={() => void panel.refetch()}>
            Tentar de novo
          </button>
        </CardContent>
      </Card>
    )
  }

  const data = panel.data
  const queue = data.items.filter((item) => item.dueStep !== null)
  const listed = data.items.filter((item) => matchesBillingFilter(item, filter))

  return (
    <div className="space-y-6">
      <p className="text-xs leading-relaxed text-muted-foreground">
        <BellRing className="mr-1.5 inline h-3.5 w-3.5 align-[-3px]" aria-hidden />
        Lembretes: ao ligar, e {describeOffsets(data.offsets)} do vencimento. Domingo e
        feriado nacional passam para o dia seguinte.{' '}
        {can('configuracoes', 'manage') && (
          <Link
            href="/configuracoes?aba=pagamentos"
            className="inline-flex items-center gap-1 whitespace-nowrap underline"
          >
            <Settings2 className="h-3 w-3" aria-hidden />
            Mudar os dias
          </Link>
        )}
      </p>

      <QueueCard panel={data} queue={queue} onOpenEntry={onOpenEntry} />

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="text-sm font-medium">Cobranças</CardTitle>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar cobranças">
            {BILLING_PANEL_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="xs"
                variant={filter === option.value ? 'default' : 'outline'}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className="tabular-nums opacity-70">
                  {data.items.filter((item) => matchesBillingFilter(item, option.value)).length}
                </span>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {listed.length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-muted-foreground">
              Nenhuma cobrança neste filtro.
            </p>
          ) : (
            <ul className="divide-y">
              {listed.map((item) => (
                <BillingRow
                  key={item.billing.id}
                  item={item}
                  panel={data}
                  onOpenEntry={onOpenEntry}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BillingSeriesCard />

      {can('financeiro', 'create') && <BatchCard entries={entries} panel={data} />}
    </div>
  )
}

function QueueCard({
  panel,
  queue,
  onOpenEntry,
}: {
  panel: BillingPanel
  queue: BillingPanelItem[]
  onOpenEntry: (entryId: string) => void
}) {
  const { can } = usePermissions()
  const office = { officeName: panel.officeName, officePhone: panel.officePhone }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Para avisar hoje · {queue.length}</CardTitle>
        <p className="text-xs text-muted-foreground">
          O WhatsApp abre com a mensagem pronta, no número do cliente. O que você fizer fica
          registrado na cobrança.
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {queue.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Nada para avisar hoje.</p>
        ) : (
          <ul className="divide-y">
            {queue.map((item) => (
              <li key={item.billing.id} className="space-y-2 px-6 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenEntry(item.entry.id)}
                      className="text-left text-sm font-medium hover:underline"
                    >
                      {clientLabel(item)}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.entry.description}
                    </p>
                  </div>
                  <AmountToday item={item} />
                </div>
                <p className="text-xs">
                  <span className="font-medium">
                    {item.dueStep ? describeStep(item.dueStep.step) : ''}
                  </span>
                  {item.entry.due_date && (
                    <span className="text-muted-foreground">
                      {' '}
                      · vencimento {shortDate(item.entry.due_date)}
                    </span>
                  )}
                  {!item.recipientPhone && (
                    <span className="text-warning">
                      {' '}
                      · sem celular no cadastro: o WhatsApp abre para escolher o contato
                    </span>
                  )}
                </p>
                {can('financeiro', 'update') && (
                  <ReminderActions item={item} office={office} today={panel.today} />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function BillingRow({
  item,
  panel,
  onOpenEntry,
}: {
  item: BillingPanelItem
  panel: BillingPanel
  onOpenEntry: (entryId: string) => void
}) {
  const { can } = usePermissions()
  const update = useUpdateBilling()
  const markPaid = useMarkPaidOutside()
  const [confirmingPaid, setConfirmingPaid] = useState(false)
  const last = item.messages[0] ?? null
  const pending = item.entry.status === 'pendente' && item.state !== 'closed'
  const canUpdate = can('financeiro', 'update')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(item.url)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  function change(changes: { paused?: boolean; reminders?: boolean }, done: string) {
    update.mutate(
      { entryId: item.entry.id, changes },
      { onSuccess: () => toast.success(done) },
    )
  }

  const activity = [
    item.billing.checkout_clicked_at
      ? `foi ao pagamento em ${shortMoment(item.billing.checkout_clicked_at)}`
      : item.billing.viewed_at
        ? `aberto em ${shortMoment(item.billing.viewed_at)}`
        : null,
    last
      ? `último aviso: ${describeStep(last.step).toLowerCase()}, ` +
        `${BILLING_MESSAGE_STATUS_LABELS[last.status].toLowerCase()} em ${shortMoment(last.created_at)}`
      : null,
    item.nextStep
      ? `próximo: ${describeStep(item.nextStep.step).toLowerCase()}, ${shortDate(item.nextStep.date)}`
      : null,
  ].filter(Boolean)

  return (
    <li className="space-y-2 px-6 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <BillingStateBadge state={item.state} />
            <button
              type="button"
              onClick={() => onOpenEntry(item.entry.id)}
              className="text-left text-sm font-medium hover:underline"
            >
              {clientLabel(item)}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {item.entry.description}
            {item.entry.due_date && ` · vencimento ${shortDate(item.entry.due_date)}`}
          </p>
          {activity.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{activity.join(' · ')}</p>
          )}
        </div>
        <AmountToday item={item} />
      </div>

      {confirmingPaid ? (
        <div className="space-y-2 rounded-md bg-muted/50 p-2.5">
          <p className="text-xs">
            Use quando o pagamento aparece no app da InfinitePay mas não chegou aqui. O checkout
            aberto é cancelado, o lançamento recebe a baixa com a data de hoje e a cobrança sai
            da régua.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              disabled={markPaid.isPending}
              onClick={() =>
                markPaid.mutate(
                  { entryId: item.entry.id, liveChargeId: item.liveChargeId },
                  { onSettled: () => setConfirmingPaid(false) },
                )
              }
            >
              {markPaid.isPending && <Loader2 className="animate-spin" />}
              Dar baixa
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={markPaid.isPending}
              onClick={() => setConfirmingPaid(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {pending && (
            <Button type="button" size="xs" variant="ghost" onClick={() => void copyLink()}>
              <Copy />
              Copiar link
            </Button>
          )}
          {canUpdate && remindersRunning(item.state) && !item.dueStep && (
            <ReminderActions
              item={item}
              office={{ officeName: panel.officeName, officePhone: panel.officePhone }}
              today={panel.today}
              mode="resend"
            />
          )}
          {canUpdate && pending && item.billing.reminders_enabled && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                item.billing.paused_at
                  ? change({ paused: false }, 'Lembretes retomados.')
                  : change({ paused: true }, 'Lembretes pausados.')
              }
            >
              {item.billing.paused_at ? <Play /> : <Pause />}
              {item.billing.paused_at ? 'Retomar' : 'Pausar'}
            </Button>
          )}
          {canUpdate && item.state === 'link_only' && item.entry.due_date && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => change({ reminders: true }, 'Lembretes ligados.')}
            >
              <BellRing />
              Ligar lembretes
            </Button>
          )}
          {canUpdate && pending && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setConfirmingPaid(true)}
            >
              <BadgeCheck />
              Já pago na InfinitePay
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** As receitas que podem entrar na régua e ainda não estão: com vencimento, a
 * partir de R$ 1,00, pendentes, sem lembrete ligado. */
function batchCandidates(
  entries: FinancialEntryWithRelations[],
  panel: BillingPanel,
): FinancialEntryWithRelations[] {
  const inReminders = new Set(
    panel.items
      .filter((item) => item.billing.reminders_enabled && !item.billing.canceled_at)
      .map((item) => item.entry.id),
  )
  return entries
    .filter(
      (entry) =>
        entry.type === 'receita' &&
        entry.status === 'pendente' &&
        entry.settlement_kind === 'scheduled' &&
        !!entry.due_date &&
        Math.round(Number(entry.amount) * 100) >= MIN_BILLING_AMOUNT_CENTS &&
        !inReminders.has(entry.id),
    )
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
}

function BatchCard({
  entries,
  panel,
}: {
  entries: FinancialEntryWithRelations[]
  panel: BillingPanel
}) {
  const batch = useEnableRemindersBatch()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const candidates = useMemo(() => batchCandidates(entries, panel), [entries, panel])

  if (candidates.length === 0) return null

  function toggle(entryId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(entryId)
      else next.delete(entryId)
      return next
    })
  }

  const chosen = candidates.filter((entry) => selected.has(entry.id)).map((entry) => entry.id)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Receitas fora da régua · {candidates.length}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Escolha as que devem ganhar link e lembretes. O primeiro aviso entra na fila de hoje.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((entry) => {
            const id = `batch-${entry.id}`
            return (
              <li key={entry.id} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  id={id}
                  checked={selected.has(entry.id)}
                  onCheckedChange={(checked) => toggle(entry.id, checked === true)}
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate">
                    {entryClientName(entry)} —{' '}
                    {entry.description}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {entry.due_date ? shortDate(entry.due_date) : ''}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCurrency(Number(entry.amount))}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={chosen.length === 0 || batch.isPending}
            onClick={() =>
              batch.mutate(chosen, { onSuccess: () => setSelected(new Set()) })
            }
          >
            {batch.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
            Ligar lembretes{chosen.length > 0 ? ` (${chosen.length})` : ''}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setSelected(
                selected.size === candidates.length
                  ? new Set()
                  : new Set(candidates.map((entry) => entry.id)),
              )
            }
          >
            {selected.size === candidates.length ? 'Desmarcar todas' : 'Marcar todas'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function entryClientName(entry: FinancialEntryWithRelations): string {
  return clientDisplayName(entry.client ?? null) ?? 'Sem cliente'
}
