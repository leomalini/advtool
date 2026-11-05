'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { formatCurrency, type FinancialEntryWithRelations } from '@/types/financialEntry.types'
import { monthRange, type FinancialFilters } from '../utils/filterFinancialEntries'
import { isAllDates, type PeriodRange } from '../utils/periods'
import { bucketCashFlow } from '../utils/summarizeEntries'

const MONTHS = 6

/** Chave da coluna "Sem data" no gráfico. Não é 'yyyy-MM' de propósito: o
 * parse de mês tem que falhar ruidosamente se alguém tratá-la como um mês. */
const UNDATED_KEY = 'undated'

/** The columns outside the period stay readable, a step back. */
const OUTSIDE_OPACITY = 0.35

const chartConfig = {
  receita: { label: 'Receitas', color: 'var(--success)' },
  despesa: { label: 'Despesas', color: 'var(--destructive)' },
} satisfies ChartConfig

const SERIES = ['receita', 'despesa'] as const

function monthOverlaps(month: string, period: PeriodRange): boolean {
  const { from, to } = monthRange(month)
  return (period.to === null || from <= period.to) && (period.from === null || to >= period.from)
}

interface FinancialCashFlowChartProps {
  /** Type, client, process and search, on every date: the chart keeps its six
   * months and marks the period instead of shrinking to it. */
  rows: FinancialEntryWithRelations[]
  filters: FinancialFilters
  onChange: (filters: FinancialFilters) => void
  isLoading: boolean
}

export function FinancialCashFlowChart({
  rows,
  filters,
  onChange,
  isLoading,
}: FinancialCashFlowChartProps) {
  const cashFlow = useMemo(() => bucketCashFlow(rows, MONTHS), [rows])
  const series = SERIES.filter((serie) => filters.type === null || filters.type === serie)

  const chartData = useMemo(() => {
    const period: PeriodRange = { from: filters.periodFrom, to: filters.periodTo }
    // Every date: nothing to mark, every column at full strength.
    const markNothing = isAllDates(period) && !filters.undatedOnly

    const months = cashFlow.months.map((m) => ({
      // 'yyyy-MM' → 'Jan', com o dia 1 só para o parse funcionar
      mes: format(parseISO(`${m.month}-01`), 'MMM', { locale: ptBR }),
      month: m.month,
      receita: m.receita,
      despesa: m.despesa,
      inPeriod: markNothing || (!filters.undatedOnly && monthOverlaps(m.month, period)),
    }))

    // A coluna "Sem data" só aparece quando existe algo nela: uma barra vazia
    // permanente ensinaria o olho a ignorá-la justamente quando ela importa.
    if (cashFlow.undated.count === 0) return months

    return [
      ...months,
      {
        mes: 'Sem data',
        month: UNDATED_KEY,
        receita: cashFlow.undated.receita,
        despesa: cashFlow.undated.despesa,
        inPeriod: markNothing || filters.undatedOnly,
      },
    ]
  }, [cashFlow, filters.periodFrom, filters.periodTo, filters.undatedOnly])

  /** A column puts its month on the whole screen; "Sem data" toggles its own
   * filter, which no interval can express. */
  function handleColumnClick(key: string) {
    if (key === UNDATED_KEY) {
      onChange({ ...filters, undatedOnly: !filters.undatedOnly, periodFrom: null, periodTo: null })
      return
    }
    const { from, to } = monthRange(key)
    onChange({ ...filters, periodFrom: from, periodTo: to, undatedOnly: false })
  }

  // Os totais do rodapé ficam nos 6 meses. Somar o sem-data aqui inflaria o
  // "Líquido" com dinheiro que depende de um evento sem prazo — ele aparece
  // na coluna e no seu próprio número, separado do que tem data.
  const totalReceitas = cashFlow.months.reduce((s, m) => s + m.receita, 0)
  const totalDespesas = cashFlow.months.reduce((s, m) => s + m.despesa, 0)
  const showsReceitas = series.includes('receita')
  const showsDespesas = series.includes('despesa')
  const net = totalReceitas - totalDespesas
  const undatedNet = cashFlow.undated.receita - cashFlow.undated.despesa

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Fluxo de Caixa — últimos 6 meses</CardTitle>
          <span className="hidden text-[11px] text-muted-foreground/70 sm:block">
            Clique numa coluna para ver o mês
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-lg" />
        ) : (
          <>
            <ChartContainer config={chartConfig} className="w-full" style={{ height: 220 }}>
              {/* onClick no gráfico, não nas barras: pega a coluna inteira do
                  mês, incluindo o espaço vazio acima das barras — bem mais
                  fácil de acertar que uma barra de 22px. */}
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 8, right: 8, top: 8 }}
                onClick={(state) => {
                  // Recharts 3 entrega o índice da coluna ativa, não o payload
                  // (activePayload existia na v2). Resolvemos pelo chartData.
                  const index = Number(state?.activeIndex)
                  const key = Number.isInteger(index) ? chartData[index]?.month : undefined
                  if (key) handleColumnClick(key)
                }}
                className="cursor-pointer"
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  className="capitalize"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                {/* ⚠️ Passar `formatter` substitui a LINHA INTEIRA do
                    tooltip — o quadradinho colorido e o nome da série somem
                    junto (ver ChartTooltipContent). Por isso o formatter
                    remonta a linha: sem ela, o tooltip mostra dois valores
                    nus e não dá para saber qual é receita e qual é despesa. */}
                <ChartTooltip
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
                              <span className="text-muted-foreground">
                                {serie?.label ?? name}
                              </span>
                            </span>
                            <span
                              className="font-medium tabular-nums"
                              style={{ color: serie?.color }}
                            >
                              {formatCurrency(Number(value))}
                            </span>
                          </div>
                        )
                      }}
                    />
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="left"
                  height={32}
                  iconType="square"
                  iconSize={9}
                  formatter={(value: string) => (
                    <span className="text-xs text-muted-foreground">
                      {chartConfig[value as keyof typeof chartConfig]?.label ?? value}
                    </span>
                  )}
                />
                {series.map((serie) => (
                  <Bar
                    key={serie}
                    dataKey={serie}
                    fill={chartConfig[serie].color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                  >
                    {chartData.map((column) => (
                      <Cell
                        key={column.month}
                        fillOpacity={column.inPeriod ? 1 : OUTSIDE_OPACITY}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ChartContainer>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t pt-4">
              {showsReceitas && (
                <div>
                  <p className="text-xs text-muted-foreground">Total receitas</p>
                  <p className="text-sm font-semibold tabular-nums text-success">
                    {formatCurrency(totalReceitas)}
                  </p>
                </div>
              )}
              {showsDespesas && (
                <div>
                  <p className="text-xs text-muted-foreground">Total despesas</p>
                  <p className="text-sm font-semibold tabular-nums text-destructive">
                    {formatCurrency(totalDespesas)}
                  </p>
                </div>
              )}
              {showsReceitas && showsDespesas && (
                <div>
                  <p className="text-xs text-muted-foreground">Líquido</p>
                  <p
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      net >= 0 ? 'text-foreground' : 'text-destructive'
                    )}
                  >
                    {formatCurrency(net)}
                  </p>
                </div>
              )}

              {/* Fora do líquido de propósito — ver o cálculo dos totais. */}
              {cashFlow.undated.count > 0 && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Sem data definida</p>
                  <p className="text-sm font-semibold tabular-nums text-info">
                    {formatCurrency(undatedNet)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
