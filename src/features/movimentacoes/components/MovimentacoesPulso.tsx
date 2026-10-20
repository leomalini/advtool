'use client'

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { SegmentedControl } from '@/features/dashboard/components/SegmentedControl'
import { MOVEMENT_GROUPS, MOVEMENT_GROUP_ORDER, type MovementGroup } from '../utils/categories'
import { ACTIVITY_SERIES, type DailyActivityPoint } from '../services/movements.service'

export const PULSE_WINDOWS = ['30', '60', '90'] as const
export type PulseWindow = (typeof PULSE_WINDOWS)[number]

const WINDOW_OPTIONS = PULSE_WINDOWS.map((value) => ({
  value,
  label: `${value} dias`,
}))

const chartConfig = Object.fromEntries(
  ACTIVITY_SERIES.map((serie) => [serie.key, { label: serie.label, color: serie.color }]),
) satisfies ChartConfig

/** 'yyyy-MM-dd' → 'dd/MM', sem passar por Date: a chave já é o dia que a
 * agregação produziu em UTC, e remontar um Date aqui reintroduziria o
 * deslocamento de fuso que o RPC resolveu. */
function shortDay(day: string): string {
  const [, month, dayOfMonth] = day.split('-')
  return month && dayOfMonth ? `${dayOfMonth}/${month}` : day
}

/**
 * Indicador compacto.
 *
 * Não é o `StatTile` do dashboard de propósito: aquele é um cartão com link
 * esticado, feito para "abrir a lista por trás do número" — e aqui a lista já
 * está na tela, então o link não teria para onde ir.
 */
function PulseStat({
  label,
  value,
  danger = false,
}: {
  label: string
  value: number | null
  danger?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'text-base font-semibold leading-none tabular-nums',
          danger && value !== null && value > 0 && 'text-destructive',
        )}
      >
        {value === null ? '—' : value}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

interface MovimentacoesPulsoProps {
  data: DailyActivityPoint[]
  isLoading: boolean
  isError: boolean
  window: PulseWindow
  onWindowChange: (window: PulseWindow) => void
  onSelectDay: (day: string) => void
  onSelectGroup: (group: MovementGroup) => void
  /** Backlog inteiro, sem recorte de período — o mesmo número do menu. */
  actionRequired: number | null
  /** Processos parados além de `STALE_MOVEMENT_DAYS`, incluindo os que nunca
   * movimentaram. */
  stalled: number | null
}

/**
 * Atividade por dia, empilhada em 4 faixas, clicável nos dois eixos de
 * interação: a coluna recorta o período para aquele dia, a legenda liga e
 * desliga as categorias daquela faixa.
 *
 * Sobre empilhar 4 grupos e não as 9 categorias, ver a nota em
 * `utils/categories.ts`.
 */
export function MovimentacoesPulso({
  data,
  isLoading,
  isError,
  window,
  onWindowChange,
  onSelectDay,
  onSelectGroup,
  actionRequired,
  stalled,
}: MovimentacoesPulsoProps) {
  const total = data.reduce((sum, point) => sum + point.total, 0)

  // ~8 rótulos no eixo, independente da janela: 90 dias impressos um a um
  // viram uma tarja preta.
  const tickInterval = Math.max(0, Math.floor(data.length / 8) - 1)

  return (
    <section className="shrink-0 border-b bg-card px-6 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pulso
          </h2>
          <PulseStat
            label={`atos em ${window} dias`}
            value={isLoading || isError ? null : total}
          />
          <PulseStat label="pedem providência" value={actionRequired} danger />
          <PulseStat label="processos parados" value={stalled} danger />
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-muted-foreground/70 sm:block">
            Clique numa coluna para ver só aquele dia
          </span>
          <SegmentedControl
            label="Janela do pulso"
            options={WINDOW_OPTIONS}
            value={window}
            onChange={onWindowChange}
          />
        </div>
      </div>

      {isError && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar o pulso.
        </p>
      )}

      {!isError && isLoading && <Skeleton className="h-[140px] w-full rounded-lg" />}

      {!isError && !isLoading && total === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma movimentação no período.
        </p>
      )}

      {!isError && !isLoading && total > 0 && (
        <ChartContainer config={chartConfig} className="w-full" style={{ height: 140 }}>
          {/* onClick no gráfico, não nas barras: pega a coluna inteira do dia,
              incluindo o espaço vazio acima — bem mais fácil de acertar que
              uma barra de 10px. */}
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 0, right: 8, top: 4 }}
            className="cursor-pointer"
            onClick={(state) => {
              // Recharts 3 entrega o índice da coluna ativa, não o payload
              // (activePayload existia na v2). Resolvemos pelo data.
              const index = Number(state?.activeIndex)
              const day = Number.isInteger(index) ? data[index]?.day : undefined
              if (day) onSelectDay(day)
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
              tickFormatter={shortDay}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            {/* ⚠️ Passar `formatter` substitui a LINHA INTEIRA do tooltip — o
                quadradinho colorido e o nome da série somem junto (ver
                ChartTooltipContent). Por isso o formatter remonta a linha. */}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => shortDay(String(label))}
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
                        <span className="font-medium tabular-nums">{Number(value)}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Legend
              verticalAlign="top"
              align="left"
              height={26}
              iconType="square"
              iconSize={9}
              onClick={(entry) => {
                const key = String((entry as { dataKey?: unknown }).dataKey ?? '')
                if (MOVEMENT_GROUP_ORDER.includes(key as MovementGroup)) {
                  onSelectGroup(key as MovementGroup)
                }
              }}
              formatter={(value: string) => (
                <span className="cursor-pointer text-xs text-muted-foreground">
                  {MOVEMENT_GROUPS[value as MovementGroup]?.label ?? value}
                </span>
              )}
            />
            {ACTIVITY_SERIES.map((serie) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                stackId="atividade"
                fill={serie.color}
                maxBarSize={14}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </section>
  )
}
