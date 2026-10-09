'use client'

import Link from 'next/link'
import { Bar, BarChart, XAxis } from 'recharts'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  MessageCircle,
  ReceiptText,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { usePermissions } from '@/hooks/usePermissions'
import { formatCurrency } from '@/types/financialEntry.types'
import {
  describeCaptureMethod,
  type PaymentCharge,
  type RecentPayment,
} from '@/types/paymentCharge.types'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import {
  useFinancialSummary,
  useMonthlyCashFlow,
} from '@/features/financeiro/hooks/useFinancialEntries'
import { useLiveCharges, useRecentPayments } from '@/features/financeiro/hooks/usePaymentCharges'
import type { FinancialSummary } from '@/features/financeiro/services/financialEntries.service'
import {
  buildPaymentMessage,
  buildWhatsAppUrl,
} from '@/features/financeiro/utils/paymentLinkMessage'
import { formatCount, formatWholeBRL, pluralize } from '../utils/format'
import { CardLink } from './CardLink'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'

/** Pagamentos recentes: um mês cobre o ciclo de cobrança do escritório. */
const RECENT_DAYS = 30
const LIST_ROWS = 3

const HEADING = 'text-[13px] font-semibold text-foreground'
const SUBHEADING = 'px-2 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
const ROW =
  'group/row relative flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 ' +
  'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring'
/** O link da linha cobre a linha inteira (`::after`); as ações ficam por cima. */
const ROW_LINK =
  'block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none'
const ICON_ACTION =
  'relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground ' +
  'transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring'
/** Row actions show on hover where there is a mouse; on touch they stay. */
const ROW_ACTIONS =
  'flex shrink-0 items-center transition-opacity pointer-fine:opacity-0 ' +
  'pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100'

function entryHref(entryId: string | null | undefined): string {
  return entryId ? `/financeiro?id=${entryId}` : '/financeiro'
}

// ── Mês corrente ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string
  value: string
  tone?: 'success' | 'danger'
  note?: string | null
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'truncate text-xl font-bold tracking-tight',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-destructive'
        )}
      >
        {value}
      </dd>
      {note && <dd className="truncate text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

/** The month in three numbers. What is still to be received lives in the
 * "A receber" indicator, with its parts — not repeated here. */
function MonthBlock({ summary }: { summary: FinancialSummary }) {
  const result = summary.receivedThisMonth - summary.expensesThisMonth

  return (
    <section className="px-4 pb-4">
      <dl className="grid grid-cols-3 gap-4">
        <Stat
          label="Recebido"
          value={formatWholeBRL(summary.receivedThisMonth)}
          tone="success"
          note={
            summary.receivedViaInfinitePayCount > 0
              ? `${formatWholeBRL(summary.receivedViaInfinitePay)} pela InfinitePay`
              : null
          }
        />
        <Stat label="Despesas" value={formatWholeBRL(summary.expensesThisMonth)} />
        <Stat
          label="Resultado"
          value={formatWholeBRL(result)}
          tone={result < 0 ? 'danger' : undefined}
        />
      </dl>
    </section>
  )
}

// ── Cobranças InfinitePay ────────────────────────────────────────────────────

function OpenChargeRow({ charge }: { charge: PaymentCharge }) {
  const amount = charge.amount_cents / 100
  const url = charge.checkout_url
  const days = differenceInCalendarDays(new Date(), parseISO(charge.created_at))
  const age =
    charge.status === 'creating'
      ? 'gerando o link'
      : days === 0
        ? 'link de hoje'
        : `link há ${pluralize(days, 'dia', 'dias')}`

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <Link href={entryHref(charge.financial_entry_id)} className={ROW_LINK}>
          {charge.description}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[charge.customer_name, age].filter(Boolean).join(' · ')}
        </p>
      </div>
      {url && (
        <div className={ROW_ACTIONS}>
          <button
            type="button"
            onClick={() => void copy(url)}
            aria-label={`Copiar o link de "${charge.description}"`}
            className={ICON_ACTION}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {/* Sem telefone: o WhatsApp abre para escolher o contato, com a
              mensagem pronta. O telefone do cliente exigiria carregar o
              cadastro de cada um; o detalhe do lançamento já faz isso. */}
          <a
            href={buildWhatsAppUrl(
              null,
              buildPaymentMessage({
                greetingName: charge.customer_name,
                description: charge.description,
                amount,
                url,
              })
            )}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Enviar o link de "${charge.description}" pelo WhatsApp`}
            className={ICON_ACTION}
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
      <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(amount)}</span>
    </li>
  )
}

function PaymentRow({ payment }: { payment: RecentPayment }) {
  const charge = payment.charge
  const method =
    describeCaptureMethod(payment.capture_method) +
    (payment.installments && payment.installments > 1 ? ` em ${payment.installments}x` : '')
  // Cancelar só deixa de oferecer o link — a InfinitePay continua aceitando
  // (migration 67). Pagamento nele é dinheiro que entrou sem cobrança viva.
  const paidOnCanceledLink = charge?.status === 'paid' && charge.canceled_at !== null

  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <Link href={entryHref(charge?.financial_entry_id)} className={ROW_LINK}>
          {charge?.description ?? 'Pagamento'}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[charge?.customer_name, method, formatRelative(payment.confirmed_at)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {paidOnCanceledLink && (
          <p className="flex items-center gap-1 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Pago num link cancelado — confira o lançamento
          </p>
        )}
      </div>
      {payment.receipt_url && (
        <div className={ROW_ACTIONS}>
          <a
            href={payment.receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir o comprovante"
            className={ICON_ACTION}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
      <span className="shrink-0 text-sm font-bold tabular-nums text-success">
        {formatCurrency(payment.paid_amount_cents / 100)}
      </span>
    </li>
  )
}

function ChargesBlock() {
  const { can } = usePermissions()
  const { data: settings, isLoading: settingsLoading } = useOfficeSettings()
  const live = useLiveCharges()
  const payments = useRecentPayments(RECENT_DAYS)

  const charges = live.data ?? []
  const received = payments.data ?? []
  const loading = settingsLoading || live.isLoading || payments.isLoading
  const openTotal = charges.reduce((sum, charge) => sum + charge.amount_cents, 0) / 100

  const heading = (
    <h3 className={cn(HEADING, 'flex items-center justify-between gap-2 px-2')}>
      Cobranças por link
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Zap aria-hidden className="size-3" />
        InfinitePay
      </span>
    </h3>
  )

  if (loading) {
    return (
      <section className="space-y-2 px-2 py-3">
        {heading}
        <div className="px-2">
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </section>
    )
  }

  // Sem conta e sem histórico: o convite. Com histórico, as listas aparecem
  // mesmo depois de a tag ser removida — os links continuam pagáveis.
  if (!settings?.infinitepay_handle && charges.length === 0 && received.length === 0) {
    return (
      <section className="space-y-1 px-2 py-3">
        {heading}
        <EmptyLine
          icon={Zap}
          tone="accent"
          title="Receba por link"
          description={
            can('configuracoes', 'manage')
              ? 'Pix ou cartão, com a baixa automática quando o cliente paga.'
              : 'Quem administra o escritório configura em Configurações → Pagamentos.'
          }
          action={
            can('configuracoes', 'manage') ? (
              <CardLink href="/configuracoes?aba=pagamentos" strong>
                Configurar
              </CardLink>
            ) : undefined
          }
        />
      </section>
    )
  }

  return (
    <section className="px-2 py-3">
      {heading}

      {(live.isError || payments.isError) && (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          Não foi possível carregar as cobranças.
        </p>
      )}

      <div className={cn(SUBHEADING, 'flex items-baseline justify-between gap-2')}>
        <span>Em aberto · {formatCount(charges.length)}</span>
        {charges.length > 0 && (
          <span className="font-semibold normal-case tracking-normal tabular-nums">
            {formatCurrency(openTotal)}
          </span>
        )}
      </div>
      {charges.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum link esperando pagamento.</p>
      ) : (
        <ul>
          {charges.slice(0, LIST_ROWS).map((charge) => (
            <OpenChargeRow key={charge.id} charge={charge} />
          ))}
        </ul>
      )}
      {charges.length > LIST_ROWS && (
        <p className="px-2 text-xs text-muted-foreground">
          e mais {pluralize(charges.length - LIST_ROWS, 'link', 'links')}
        </p>
      )}

      <p className={SUBHEADING}>Recebidos · {RECENT_DAYS} dias</p>
      {received.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum pagamento no período.</p>
      ) : (
        <ul>
          {received.slice(0, LIST_ROWS).map((payment) => (
            <PaymentRow key={payment.id} payment={payment} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Fluxo de 6 meses ─────────────────────────────────────────────────────────

/** As cores da página do Financeiro: a mesma série tem a mesma cor nas duas. */
const chartConfig = {
  receita: { label: 'Receitas', color: 'var(--success)' },
  despesa: { label: 'Despesas', color: 'var(--destructive)' },
} satisfies ChartConfig

/**
 * The chart grows to the height of the column beside it (`flex-1` in a
 * stretched grid cell): with a fixed height, the charges list next to it left
 * a blank block under the chart — the empty space this layout exists to avoid.
 */
function CashFlowBlock() {
  const { data: cashFlow, isLoading, isError } = useMonthlyCashFlow(6)

  const data = (cashFlow?.months ?? []).map((month) => ({
    mes: format(parseISO(`${month.month}-01`), 'MMM', { locale: ptBR }),
    receita: month.receita,
    despesa: month.despesa,
  }))
  const totalReceita = data.reduce((sum, month) => sum + month.receita, 0)
  const totalDespesa = data.reduce((sum, month) => sum + month.despesa, 0)
  const isEmpty = cashFlow !== undefined && totalReceita === 0 && totalDespesa === 0

  return (
    <section className="flex min-w-0 flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={HEADING}>Fluxo · 6 meses</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {(['receita', 'despesa'] as const).map((serie) => (
            <span key={serie} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-[2px]"
                style={{ backgroundColor: chartConfig[serie].color }}
              />
              {chartConfig[serie].label}
            </span>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton className="min-h-36 w-full flex-1 rounded-lg" />}
      {isError && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o fluxo.</p>
      )}

      {isEmpty && (
        <EmptyLine
          icon={ReceiptText}
          title="Sem lançamentos em 6 meses"
          description="O fluxo aparece com as primeiras receitas e despesas."
          className="px-0"
        />
      )}

      {cashFlow && !isEmpty && (
        <>
          <ChartContainer config={chartConfig} className="aspect-auto min-h-36 w-full flex-1">
            <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                className="capitalize"
              />
              {/* `formatter` substitui a linha inteira do tooltip — por isso ela
                  é remontada com a cor e o nome da série (como no Financeiro). */}
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const serie = chartConfig[name as keyof typeof chartConfig]
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: serie?.color }}
                            />
                            <span className="text-muted-foreground">{serie?.label ?? name}</span>
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(Number(value))}
                          </span>
                        </div>
                      )
                    }}
                  />
                }
              />
              <Bar dataKey="receita" fill="var(--color-receita)" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="despesa" fill="var(--color-despesa)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            Receitas {formatWholeBRL(totalReceita)} · Despesas {formatWholeBRL(totalDespesa)}
          </p>
        </>
      )}
    </section>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface FinanceCardProps {
  className?: string
}

/**
 * O mês, o que está para receber, as cobranças por link da InfinitePay e o
 * fluxo de 6 meses. Só para `financeiro:view` — quem renderiza confere.
 *
 * Números do mesmo `getFinancialSummary` e `getMonthlyCashFlow` da página do
 * Financeiro: o dashboard e a página nunca discordam.
 */
export function FinanceCard({ className }: FinanceCardProps) {
  const { data: summary, isLoading, isError } = useFinancialSummary()

  return (
    <DashboardCard
      icon={Wallet}
      tone="success"
      title="Financeiro"
      subtitle={format(new Date(), 'MMMM', { locale: ptBR })}
      action={<CardLink href="/financeiro">Abrir Financeiro</CardLink>}
      className={className}
      bodyClassName=""
    >
      {isLoading && (
        <div className="px-4 pb-4">
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      )}
      {isError && (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          Não foi possível carregar o resumo.
        </p>
      )}
      {summary && <MonthBlock summary={summary} />}

      {/* Side by side when the card is wide enough; the chart's cell stretches
          to the height of the list. Stacked, a hairline separates the two. */}
      <div className="grid border-t @xl:grid-cols-2 @xl:divide-x @max-xl:[&>*+*]:border-t">
        <CashFlowBlock />
        <ChargesBlock />
      </div>
    </DashboardCard>
  )
}
