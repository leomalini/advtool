'use client'

import Link from 'next/link'
import { Bar, BarChart, XAxis } from 'recharts'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { AlertTriangle, Copy, ExternalLink, MessageCircle, Wallet } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { FinancialSituationFilter } from '@/features/financeiro/utils/filterFinancialEntries'
import { formatCount, formatWholeBRL, pluralize } from '../utils/format'

/** Pagamentos recentes: um mês cobre o ciclo de cobrança do escritório. */
const RECENT_DAYS = 30
const LIST_ROWS = 4

const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const ROW =
  'relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 ' +
  'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring'
/** O link da linha cobre a linha inteira (`::after`); as ações ficam por cima. */
const ROW_LINK =
  'block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none'
const ICON_ACTION =
  'relative z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground ' +
  'transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring'

function situationHref(situation: FinancialSituationFilter): string {
  return `/financeiro?situacao=${situation}`
}

function entryHref(entryId: string | null | undefined): string {
  return entryId ? `/financeiro?id=${entryId}` : '/financeiro'
}

// ── Mês corrente ─────────────────────────────────────────────────────────────

/** As três parcelas que somam "A receber" — as cores da página do Financeiro. */
const RECEIVABLE_PARTS = [
  {
    situation: 'a_vencer',
    label: 'A vencer',
    value: (s: FinancialSummary) => s.receivableUpcoming,
    bar: 'bg-warning',
    text: 'text-warning',
  },
  {
    situation: 'vencido',
    label: 'Vencido',
    value: (s: FinancialSummary) => s.receivableOverdue,
    bar: 'bg-destructive',
    text: 'text-destructive',
  },
  {
    situation: 'condicao_especial',
    label: 'Condição especial',
    value: (s: FinancialSummary) => s.receivableConditional,
    bar: 'bg-info',
    text: 'text-info',
  },
] as const

function MonthBlock({ summary }: { summary: FinancialSummary }) {
  const result = summary.receivedThisMonth - summary.expensesThisMonth
  const total = summary.receivableTotal

  return (
    <section className="space-y-4">
      <h3 className={HEADING}>{format(new Date(), 'MMMM', { locale: ptBR })}</h3>

      <dl className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Recebido</dt>
          <dd className="truncate text-lg font-semibold tabular-nums text-success">
            {formatWholeBRL(summary.receivedThisMonth)}
          </dd>
          {summary.receivedViaInfinitePayCount > 0 && (
            <dd className="text-[11px] text-muted-foreground">
              {formatWholeBRL(summary.receivedViaInfinitePay)} pela InfinitePay
            </dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Despesas</dt>
          <dd className="truncate text-lg font-semibold tabular-nums">
            {formatWholeBRL(summary.expensesThisMonth)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Resultado</dt>
          <dd
            className={cn(
              'truncate text-lg font-semibold tabular-nums',
              result < 0 ? 'text-destructive' : 'text-foreground'
            )}
          >
            {formatWholeBRL(result)}
          </dd>
        </div>
      </dl>

      {/* "A receber" é o TUDO; a barra mostra de que ele é feito, e cada parcela
          abre o Financeiro já no recorte dela. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={situationHref('a_receber')}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            A receber
          </Link>
          <span className="text-lg font-semibold tabular-nums">{formatWholeBRL(total)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          {total > 0 &&
            RECEIVABLE_PARTS.map((part) => {
              const value = part.value(summary)
              if (value <= 0) return null
              return (
                <div
                  key={part.situation}
                  className={part.bar}
                  style={{ width: `${(value / total) * 100}%` }}
                />
              )
            })}
        </div>
        <ul className="grid grid-cols-3 gap-1">
          {RECEIVABLE_PARTS.map((part) => {
            const value = part.value(summary)
            return (
              <li key={part.situation} className="min-w-0">
                <Link
                  href={situationHref(part.situation)}
                  className="block rounded-md px-1.5 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', part.bar)} />
                    {part.label}
                  </span>
                  <span
                    className={cn(
                      'block truncate text-sm font-semibold tabular-nums',
                      value > 0 ? part.text : 'text-muted-foreground'
                    )}
                  >
                    {formatWholeBRL(value)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
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
        <p className="truncate text-[11px] text-muted-foreground">
          {[charge.customer_name, age].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(amount)}</span>
      {url && (
        <>
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
        </>
      )}
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
        <p className="truncate text-[11px] text-muted-foreground">
          {[charge?.customer_name, method, formatRelative(payment.confirmed_at)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {paidOnCanceledLink && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Pago num link cancelado — confira o lançamento
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
        {formatCurrency(payment.paid_amount_cents / 100)}
      </span>
      {payment.receipt_url && (
        <a
          href={payment.receipt_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir o comprovante"
          className={ICON_ACTION}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
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

  if (loading) {
    return (
      <section className="space-y-2">
        <h3 className={HEADING}>Cobranças por link</h3>
        <Skeleton className="h-28 w-full rounded-lg" />
      </section>
    )
  }

  // Sem conta e sem histórico: o convite. Com histórico, as listas aparecem
  // mesmo depois de a tag ser removida — os links continuam pagáveis.
  if (!settings?.infinitepay_handle && charges.length === 0 && received.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className={HEADING}>Cobranças por link</h3>
        <p className="text-sm text-muted-foreground">
          Com a InfinitePay, uma receita ganha link de pagamento por Pix ou cartão, e a baixa
          acontece sozinha quando o cliente paga.
        </p>
        {can('configuracoes', 'manage') ? (
          <Link
            href="/configuracoes?aba=pagamentos"
            className="inline-flex text-sm font-medium text-foreground hover:underline"
          >
            Configurar a InfinitePay
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">
            Quem administra o escritório configura em Configurações → Pagamentos.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className={HEADING}>Cobranças por link</h3>

      {(live.isError || payments.isError) && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar as cobranças.</p>
      )}

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 px-2 text-[11px] text-muted-foreground">
          <span>Em aberto · {formatCount(charges.length)}</span>
          {charges.length > 0 && (
            <span className="font-medium tabular-nums">{formatCurrency(openTotal)}</span>
          )}
        </div>
        {charges.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Nenhum link esperando pagamento.</p>
        ) : (
          <ul>
            {charges.slice(0, LIST_ROWS).map((charge) => (
              <OpenChargeRow key={charge.id} charge={charge} />
            ))}
          </ul>
        )}
        {charges.length > LIST_ROWS && (
          <p className="px-2 text-[11px] text-muted-foreground">
            e mais {pluralize(charges.length - LIST_ROWS, 'link', 'links')}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <p className="px-2 text-[11px] text-muted-foreground">
          Recebidos · {RECENT_DAYS} dias
        </p>
        {received.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Nenhum pagamento no período.</p>
        ) : (
          <ul>
            {received.slice(0, LIST_ROWS).map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ── Fluxo de 6 meses ─────────────────────────────────────────────────────────

/** As cores da página do Financeiro: a mesma série tem a mesma cor nas duas. */
const chartConfig = {
  receita: { label: 'Receitas', color: 'var(--success)' },
  despesa: { label: 'Despesas', color: 'var(--destructive)' },
} satisfies ChartConfig

function CashFlowBlock() {
  const { data: cashFlow, isLoading, isError } = useMonthlyCashFlow(6)

  const data = (cashFlow?.months ?? []).map((month) => ({
    mes: format(parseISO(`${month.month}-01`), 'MMM', { locale: ptBR }),
    receita: month.receita,
    despesa: month.despesa,
  }))
  const totalReceita = data.reduce((sum, month) => sum + month.receita, 0)
  const totalDespesa = data.reduce((sum, month) => sum + month.despesa, 0)

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={HEADING}>Fluxo · 6 meses</h3>
        <Link
          href="/financeiro"
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Ver no Financeiro
        </Link>
      </div>

      {isLoading && <Skeleton className="h-36 w-full rounded-lg" />}
      {isError && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o fluxo.</p>
      )}

      {cashFlow && (
        <>
          <ChartContainer config={chartConfig} className="h-36 w-full">
            <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
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
              <Bar dataKey="receita" fill="var(--color-receita)" radius={3} />
              <Bar dataKey="despesa" fill="var(--color-despesa)" radius={3} />
            </BarChart>
          </ChartContainer>
          <p className="text-[11px] text-muted-foreground">
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
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Wallet className="h-4 w-4 text-success" />
          Financeiro
        </CardTitle>
        <CardAction>
          <Link
            href="/financeiro"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Abrir Financeiro
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-3">
          {isLoading && <Skeleton className="h-48 w-full rounded-lg" />}
          {isError && (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o resumo.</p>
          )}
          {summary && <MonthBlock summary={summary} />}
          <ChargesBlock />
          <CashFlowBlock />
        </div>
      </CardContent>
    </Card>
  )
}
