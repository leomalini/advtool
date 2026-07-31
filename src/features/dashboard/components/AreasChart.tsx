'use client'

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { useCasesByLegalArea } from '../hooks/useDashboardStats'
import { BarChart3 } from 'lucide-react'

// Horizontal bars: the categories are ranked and their labels are words, not
// dates — reading them along the y-axis avoids rotated text entirely.
//
// Colours come from AREAS_JURIDICAS rather than the generic --chart-N ramp so
// an area keeps the same colour here as in every badge across the app. There
// are 7 areas and only 5 chart tokens, so the ramp would collide anyway.
const chartConfig = {
  count: { label: 'Casos' },
} satisfies ChartConfig

export function AreasChart() {
  const { data: areas, isLoading } = useCasesByLegalArea()

  const chartData = (areas ?? []).map((a) => {
    const meta = AREAS_JURIDICAS[a.legal_area as AreaJuridica]
    return {
      area: a.legal_area,
      label: meta?.label ?? a.legal_area,
      count: a.count,
      fill: meta?.accent ?? 'var(--muted-foreground)',
    }
  })

  const total = chartData.reduce((sum, a) => sum + a.count, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent-foreground" />
          Casos por Área
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-[180px] w-full rounded-lg" />}

        {!isLoading && chartData.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nenhum caso com área jurídica definida.
          </p>
        )}

        {!isLoading && chartData.length > 0 && (
          <>
            <ChartContainer
              config={chartConfig}
              className="w-full"
              style={{ height: Math.max(chartData.length * 34, 120) }}
            >
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ left: 0, right: 28, top: 4, bottom: 4 }}
              >
                <YAxis
                  dataKey="label"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={96}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <XAxis dataKey="count" type="number" hide />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey="label" hideLabel />}
                />
                <Bar dataKey="count" radius={4} barSize={14}>
                  {chartData.map((entry) => (
                    <Cell key={entry.area} fill={entry.fill} />
                  ))}
                  {/* Value at the end of each bar removes the need to
                      eyeball lengths against an axis. */}
                  <LabelList
                    dataKey="count"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>

            <div className="pt-3 mt-1 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total de casos</span>
                <span className="font-semibold tabular-nums">{total}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
