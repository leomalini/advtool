'use client'

import { useMemo } from 'react'
import { AlertTriangle, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  todayISO,
  type FinancialEntryType,
  type FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import {
  periodOf,
  type FinancialFilters,
  type FinancialSituationFilter,
} from '../utils/filterFinancialEntries'
import { describePeriod, isAllDates } from '../utils/periods'
import { summarizeEntries, summarizeOutsidePeriod } from '../utils/summarizeEntries'

const PRESSABLE =
  'text-left transition-all hover:border-foreground/25 focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring'
const PRESSED = 'border-foreground/40 bg-muted/40'
const OUTSIDE_LINK = 'inline-flex items-center gap-1.5 hover:underline'

/** What each side of the block calls itself. */
const SIDES: Record<
  FinancialEntryType,
  { title: string; everything: string; overdueNote: string }
> = {
  receita: {
    title: 'A receber',
    everything: 'Tudo que ainda não foi recebido',
    overdueNote: 'Cobrança em atraso',
  },
  despesa: {
    title: 'A pagar',
    everything: 'Tudo que ainda não foi pago',
    overdueNote: 'Pagamento em atraso',
  },
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function pluralizeEntries(count: number): string {
  return `${count} lançamento${count === 1 ? '' : 's'}`
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number
  note: string
  colorClass: string
  bgClass: string
  /** The card's slice is the one on screen. `undefined`: not a toggle. */
  pressed?: boolean
  /** The type on screen leaves it out: no number, still clickable. */
  dimmed: boolean
  isLoading: boolean
  onClick: () => void
}

function KpiCard({
  icon,
  label,
  value,
  note,
  colorClass,
  bgClass,
  pressed,
  dimmed,
  isLoading,
  onClick,
}: KpiCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        'rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-sm',
        PRESSABLE,
        pressed && PRESSED
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                dimmed ? 'text-muted-foreground/50' : colorClass
              )}
            >
              {dimmed ? '—' : formatCurrency(value)}
            </p>
          )}
          <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
        </div>
        <div className={cn('shrink-0 rounded-lg p-2.5', bgClass, dimmed && 'opacity-50')}>
          {icon}
        </div>
      </div>
    </button>
  )
}

interface OpenTileProps {
  label: string
  value: number
  sublabel: string
  colorClass: string
  active: boolean
  onClick: () => void
}

/** Uma das três parcelas que somam o bloco. Clicável porque o indicador e o
 * filtro falam a mesma língua: o card mostra o número, o clique mostra de
 * quais lançamentos ele veio. */
function OpenTile({ label, value, sublabel, colorClass, active, onClick }: OpenTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('rounded-lg border p-3', PRESSABLE, active ? PRESSED : 'border-border')}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', colorClass)}>
        {formatCurrency(value)}
      </p>
      <p className="mt-0.5 h-4 text-[11px] text-muted-foreground/80">{sublabel}</p>
    </button>
  )
}

interface FinancialOverviewProps {
  /** The screen's filters except the situation — the cards' own slice, which
   * would otherwise zero the other cards. */
  rows: FinancialEntryWithRelations[]
  /** The same filters on every date: what the period leaves out. */
  allDateRows: FinancialEntryWithRelations[]
  filters: FinancialFilters
  onChange: (filters: FinancialFilters) => void
  isLoading: boolean
}

/**
 * The period's numbers (docs/financeiro.md): received, expenses and net, then
 * what is still open — "A receber", or "A pagar" when the screen shows
 * expenses. Every number adds up rows the table would show, and every one is
 * a click away from them.
 */
export function FinancialOverview({
  rows,
  allDateRows,
  filters,
  onChange,
  isLoading,
}: FinancialOverviewProps) {
  const period = periodOf(filters)
  const today = todayISO()
  const side: FinancialEntryType = filters.type === 'despesa' ? 'despesa' : 'receita'
  const totals = useMemo(() => summarizeEntries(rows, today), [rows, today])
  const outside = useMemo(
    () =>
      summarizeOutsidePeriod(
        allDateRows,
        { from: filters.periodFrom, to: filters.periodTo },
        side,
        today
      ),
    [allDateRows, filters.periodFrom, filters.periodTo, side, today]
  )

  const open = side === 'receita' ? totals.receivable : totals.payable
  const wording = SIDES[side]
  const phrase = filters.undatedOnly ? 'só os sem data definida' : describePeriod(period, today)
  const net = totals.received - totals.expenses

  // The block's heading: on every date it is the whole bucket, as it always
  // was; otherwise it says which slice it is.
  const openTitle = filters.undatedOnly
    ? `${wording.title} sem data definida`
    : isAllDates(period)
      ? wording.title
      : `${wording.title} ${phrase}`
  const openNote = filters.undatedOnly
    ? 'Condição especial sem previsão de data'
    : isAllDates(period)
      ? wording.everything
      : 'Em aberto, com data no período'

  const periodNote = capitalize(phrase)
  const receivedNote =
    totals.receivedViaInfinitePayCount > 0
      ? `${periodNote} · ${formatCurrency(totals.receivedViaInfinitePay)} pela InfinitePay`
      : periodNote
  // Paid or not, as the dashboard always counted them: the unpaid part is said
  // here, so the number does not read as money already gone.
  const expensesNote =
    totals.payable.total > 0
      ? `${periodNote} · ${formatCurrency(totals.payable.total)} a pagar`
      : periodNote

  /** A tile of the block: its situation on the block's side; again, off. */
  function toggleOpen(situation: FinancialSituationFilter) {
    const active = filters.situation === situation && filters.type === side
    onChange({ ...filters, situation: active ? null : situation, type: side })
  }

  const receivedPressed = filters.type === 'receita' && filters.situation === 'pago'
  const expensesPressed = filters.type === 'despesa' && filters.situation === null

  return (
    <div className="space-y-4">
      {/* ── O período ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<TrendingUp className="h-4.5 w-4.5 text-success" />}
          label="Recebido"
          value={totals.received}
          note={receivedNote}
          colorClass="text-success"
          bgClass="bg-success/10"
          pressed={receivedPressed}
          dimmed={filters.type === 'despesa'}
          isLoading={isLoading}
          onClick={() =>
            onChange(
              receivedPressed
                ? { ...filters, type: null, situation: null }
                : { ...filters, type: 'receita', situation: 'pago' }
            )
          }
        />
        <KpiCard
          icon={<TrendingDown className="h-4.5 w-4.5 text-destructive" />}
          label="Despesas"
          value={totals.expenses}
          note={expensesNote}
          colorClass="text-destructive"
          bgClass="bg-destructive/10"
          pressed={expensesPressed}
          dimmed={filters.type === 'receita'}
          isLoading={isLoading}
          onClick={() =>
            onChange(
              expensesPressed
                ? { ...filters, type: null }
                : { ...filters, type: 'despesa', situation: null }
            )
          }
        />
        <KpiCard
          icon={<Wallet className="h-4.5 w-4.5 text-foreground/70" />}
          label="Líquido"
          value={net}
          note="Recebido − despesas"
          colorClass={net < 0 ? 'text-destructive' : 'text-foreground'}
          bgClass="bg-muted"
          dimmed={filters.type !== null}
          isLoading={isLoading}
          // Everything of the period: both sides, every situation.
          onClick={() => onChange({ ...filters, type: null, situation: null })}
        />
      </div>

      {/* ── Em aberto ──
          Hierarquia, não quatro cards soltos: o número grande é o TUDO, e as
          três parcelas ao lado somam exatamente ele. */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <button
              type="button"
              onClick={() => toggleOpen('a_receber')}
              aria-pressed={filters.situation === 'a_receber' && filters.type === side}
              className={cn(
                'shrink-0 rounded-lg border p-3 lg:w-64',
                PRESSABLE,
                filters.situation === 'a_receber' && filters.type === side
                  ? PRESSED
                  : 'border-transparent'
              )}
            >
              <p className="text-xs text-muted-foreground">{openTitle}</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-9 w-40" />
              ) : (
                <p className="mt-0.5 text-3xl font-semibold tabular-nums">
                  {formatCurrency(open.total)}
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground/80">{openNote}</p>
            </button>

            <span className="hidden text-lg text-muted-foreground/40 lg:block">=</span>

            {/* min-w-0: um item flex tem `min-width: auto`, então sem isto o
                grid se recusa a encolher abaixo do conteúdo das três parcelas
                e empurra a linha para fora do card em telas estreitas. */}
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              <OpenTile
                label="A vencer"
                value={open.upcoming}
                sublabel="Com data, no prazo"
                colorClass="text-warning"
                active={filters.situation === 'a_vencer' && filters.type === side}
                onClick={() => toggleOpen('a_vencer')}
              />
              <OpenTile
                label="Vencido"
                value={open.overdue}
                sublabel={open.overdue ? wording.overdueNote : 'Nenhum atraso'}
                colorClass={open.overdue ? 'text-destructive' : 'text-muted-foreground'}
                active={filters.situation === 'vencido' && filters.type === side}
                onClick={() => toggleOpen('vencido')}
              />
              <OpenTile
                label="Condição especial"
                value={open.conditional}
                sublabel={
                  open.conditionalCount ? pluralizeEntries(open.conditionalCount) : 'Nenhum'
                }
                colorClass={open.conditional ? 'text-info' : 'text-muted-foreground'}
                active={filters.situation === 'condicao_especial' && filters.type === side}
                onClick={() => toggleOpen('condicao_especial')}
              />
            </div>
          </div>

          {/* What the period leaves out, so it does not vanish without a word:
              each line opens it, on every date. */}
          {(outside.overdueBefore.count > 0 || outside.undated.count > 0) && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3 text-xs">
              {outside.overdueBefore.count > 0 && filters.periodFrom && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      periodFrom: null,
                      periodTo: null,
                      undatedOnly: false,
                      situation: 'vencido',
                      type: side,
                    })
                  }
                  className={cn(OUTSIDE_LINK, 'font-medium text-destructive')}
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {formatCurrency(outside.overdueBefore.amount)}{' '}
                  {outside.overdueBefore.count === 1 ? 'vencido' : 'vencidos'} antes do período
                  · ver
                </button>
              )}
              {outside.undated.count > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      periodFrom: null,
                      periodTo: null,
                      undatedOnly: true,
                      situation: null,
                      type: side,
                    })
                  }
                  className={cn(OUTSIDE_LINK, 'text-info')}
                >
                  {pluralizeEntries(outside.undated.count)} em condição especial sem data (
                  {formatCurrency(outside.undated.amount)}) fora do período · ver
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
