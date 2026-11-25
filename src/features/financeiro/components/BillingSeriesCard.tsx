'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarClock, Loader2, Pause, Pencil, Play, Plus, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import {
  BILLING_SERIES_STATE_LABELS,
  SERIES_CLIENT_DESCRIPTION_MAX,
  SERIES_DESCRIPTION_MAX,
  type BillingSeries,
  type BillingSeriesItem,
  type BillingSeriesState,
} from '@/types/billingSeries.types'
import { formatCurrency, formatPercent, todayISO } from '@/types/financialEntry.types'
import {
  useBillingSeriesList,
  useCreateBillingSeries,
  useUpdateBillingSeries,
} from '../hooks/useBillingSeries'
import { parsePercentInput, percentToInput } from '../utils/percentInput'

const STATE_TONES: Record<BillingSeriesState, string> = {
  active: 'bg-success/12 text-success',
  paused: 'bg-warning/12 text-warning',
  ended: 'bg-muted text-muted-foreground',
}

const DEFAULT_CLIENT_DESCRIPTION = 'Honorários mensais'

function shortDate(isoDate: string): string {
  return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: ptBR })
}

/** "todo dia 10"; do 29 ao 31, o mês curto usa o último dia. */
function describeDay(startDate: string): string {
  const day = Number(startDate.slice(8, 10))
  return day >= 29 ? `todo dia ${day} (ou o último do mês)` : `todo dia ${day}`
}

/**
 * As mensalidades (fase 4 de docs/cobrancas.md, migration 98), na aba
 * Cobranças. Cada ciclo nasce alguns dias antes do vencimento como um
 * lançamento com a cobrança no ar; daí em diante é um lançamento comum.
 */
export function BillingSeriesCard() {
  const { can } = usePermissions()
  const list = useBillingSeriesList()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<BillingSeries | null>(null)
  const items = list.data ?? []

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Mensalidades
            {items.length > 0 && (
              <span className="tabular-nums text-muted-foreground">· {items.length}</span>
            )}
          </CardTitle>
          {can('financeiro', 'create') && (
            <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              Nova mensalidade
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          O mesmo valor todo mês. Cada mês vira um lançamento com o link no ar alguns dias antes
          do vencimento, e entra na régua como qualquer cobrança.
        </p>
      </CardHeader>
      <CardContent className="px-0">
        {list.isLoading ? (
          <div className="px-6">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : list.isError ? (
          <p className="px-6 text-sm text-destructive">{list.error.message}</p>
        ) : items.length === 0 ? (
          <p className="px-6 py-4 text-center text-sm text-muted-foreground">
            Nenhuma mensalidade.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <SeriesRow
                key={item.series.id}
                item={item}
                canUpdate={can('financeiro', 'update')}
                onEdit={() => setEditing(item.series)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova mensalidade</DialogTitle>
          </DialogHeader>
          {creating && <SeriesForm onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar mensalidade</DialogTitle>
          </DialogHeader>
          {editing && <SeriesForm series={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SeriesRow({
  item,
  canUpdate,
  onEdit,
}: {
  item: BillingSeriesItem
  canUpdate: boolean
  onEdit: () => void
}) {
  const update = useUpdateBillingSeries()
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const { series, state } = item
  const act = (action: 'pause' | 'resume' | 'end') =>
    update.mutate({ id: series.id, changes: { action } })

  const details = [
    describeDay(series.start_date),
    series.end_date ? `até ${shortDate(series.end_date)}` : null,
    item.nextDueDate && state !== 'ended' ? `próximo: ${shortDate(item.nextDueDate)}` : null,
    item.generatedCount === 1 ? '1 mês gerado' : `${item.generatedCount} meses gerados`,
    series.reminders_enabled ? 'com lembretes' : 'sem lembretes',
  ].filter((part): part is string => part !== null)

  return (
    <li className="space-y-2 px-6 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{item.clientName ?? 'Cliente sem nome'}</span>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                STATE_TONES[state],
              )}
            >
              {BILLING_SERIES_STATE_LABELS[state]}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{series.description}</p>
          <p className="text-[11px] text-muted-foreground">{details.join(' · ')}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {formatCurrency(Number(series.amount))}
        </span>
      </div>

      {canUpdate && state !== 'ended' && (
        confirmingEnd ? (
          <div className="space-y-2 rounded-md bg-muted/50 p-2.5">
            <p className="text-xs">
              Encerrar para de gerar os próximos meses. Os já gerados continuam no Financeiro, com
              as cobranças deles.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="xs"
                variant="destructive"
                disabled={update.isPending}
                onClick={() => act('end')}
              >
                {update.isPending && <Loader2 className="animate-spin" />}
                Encerrar
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setConfirmingEnd(false)}
              >
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="xs" variant="ghost" onClick={onEdit}>
              <Pencil />
              Editar
            </Button>
            {state === 'paused' ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => act('resume')}
              >
                <Play />
                Retomar
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => act('pause')}
              >
                <Pause />
                Pausar
              </Button>
            )}
            <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmingEnd(true)}>
              <Square />
              Encerrar
            </Button>
          </div>
        )
      )}
    </li>
  )
}

type PercentKey = 'lateFeePercent' | 'monthlyInterestPercent' | 'pixDiscountPercent'

const PERCENT_FIELDS: { key: PercentKey; label: string; max: number }[] = [
  { key: 'lateFeePercent', label: 'Multa (%)', max: 100 },
  { key: 'monthlyInterestPercent', label: 'Juros (% ao mês)', max: 100 },
  { key: 'pixDiscountPercent', label: 'Desconto no Pix (%)', max: 99.99 },
]

/** Criar (sem `series`) ou editar. Editar não muda cliente nem o dia: para
 * isso, encerra-se esta e cria-se outra. */
function SeriesForm({ series, onDone }: { series?: BillingSeries; onDone: () => void }) {
  const create = useCreateBillingSeries()
  const update = useUpdateBillingSeries()
  const pending = create.isPending || update.isPending
  const editing = series !== undefined

  const [clientId, setClientId] = useState<string | null>(series?.client_id ?? null)
  const [clientDescription, setClientDescription] = useState(
    series?.client_description ?? DEFAULT_CLIENT_DESCRIPTION,
  )
  const [description, setDescription] = useState(series?.description ?? '')
  const [amount, setAmount] = useState<number | undefined>(
    series ? Number(series.amount) : undefined,
  )
  const [startDate, setStartDate] = useState(series?.start_date ?? '')
  const [endDate, setEndDate] = useState(series?.end_date ?? '')
  const [reminders, setReminders] = useState(series?.reminders_enabled ?? true)
  const [percents, setPercents] = useState<Record<PercentKey, string>>({
    lateFeePercent: percentToInput(series?.late_fee_percent ?? null),
    monthlyInterestPercent: percentToInput(series?.monthly_interest_percent ?? null),
    pixDiscountPercent: percentToInput(series?.pix_discount_percent ?? null),
  })

  const parsed = Object.fromEntries(
    PERCENT_FIELDS.map((field) => [field.key, parsePercentInput(percents[field.key], field.max)]),
  ) as Record<PercentKey, number | null | 'invalid'>
  const today = todayISO()

  const problem = (() => {
    if (!editing && !clientId) return 'Escolha o cliente.'
    if (!clientDescription.trim()) return 'Diga o que o cliente vê.'
    if (!description.trim()) return 'Descreva a mensalidade.'
    if (!amount || amount < 1) return 'O valor mínimo é R$ 1,00.'
    if (!editing && !startDate) return 'Informe o primeiro vencimento.'
    if (!editing && startDate < today) return 'O primeiro vencimento é hoje ou depois.'
    if (endDate && endDate < (series?.start_date ?? startDate)) {
      return 'O fim vem depois do primeiro vencimento.'
    }
    const invalid = PERCENT_FIELDS.find((field) => parsed[field.key] === 'invalid')
    if (invalid) return `${invalid.label}: um número de 0 a ${formatPercent(invalid.max)}.`
    return null
  })()

  function submit() {
    if (problem || !amount) return
    const terms = {
      lateFeePercent: parsed.lateFeePercent as number | null,
      monthlyInterestPercent: parsed.monthlyInterestPercent as number | null,
      pixDiscountPercent: parsed.pixDiscountPercent as number | null,
    }
    if (series) {
      update.mutate(
        {
          id: series.id,
          changes: {
            clientDescription,
            description,
            amount,
            endDate: endDate || null,
            remindersEnabled: reminders,
            ...terms,
          },
        },
        { onSuccess: onDone },
      )
      return
    }
    create.mutate(
      {
        clientId: clientId ?? '',
        legalProcessId: null,
        clientDescription,
        description,
        category: 'honorario',
        amount,
        startDate,
        endDate: endDate || null,
        remindersEnabled: reminders,
        ...terms,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="space-y-4">
      {!editing && (
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <ClienteCombobox value={clientId} onChange={setClientId} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="series-client-description">Como o cliente vê</Label>
        <Input
          id="series-client-description"
          value={clientDescription}
          maxLength={SERIES_CLIENT_DESCRIPTION_MAX}
          onChange={(event) => setClientDescription(event.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Vai na mensagem e na página, com o mês: &ldquo;{clientDescription.trim() || '…'} —
          12/2026&rdquo;.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="series-description">Descrição interna</Label>
        <Input
          id="series-description"
          value={description}
          maxLength={SERIES_DESCRIPTION_MAX}
          placeholder="Ex: Consultoria trabalhista mensal"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="series-amount">Valor por mês</Label>
          <CurrencyInput id="series-amount" value={amount} onChange={setAmount} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-start">Primeiro vencimento</Label>
          <Input
            id="series-start"
            type="date"
            min={today}
            value={startDate}
            disabled={editing}
            onChange={(event) => setStartDate(event.target.value)}
          />
          {startDate && (
            <p className="text-[11px] text-muted-foreground">Vence {describeDay(startDate)}.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-end">Termina em (opcional)</Label>
          <Input
            id="series-end"
            type="date"
            min={series?.start_date ?? (startDate || today)}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PERCENT_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`series-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            <Input
              id={`series-${field.key}`}
              inputMode="decimal"
              placeholder="sem"
              value={percents[field.key]}
              aria-invalid={parsed[field.key] === 'invalid'}
              onChange={(event) =>
                setPercents((previous) => ({ ...previous, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={reminders}
          onCheckedChange={(checked) => setReminders(checked === true)}
        />
        Cobrar automaticamente: lembretes ao cliente nos dias da régua
      </label>

      {editing && (
        <p className="text-xs text-muted-foreground">
          As mudanças valem para os próximos meses. Os já gerados são lançamentos e não mudam.
        </p>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={problem !== null || pending} onClick={submit}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? 'Salvar' : 'Criar mensalidade'}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
