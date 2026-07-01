import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CASOS, AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { BarChart3 } from 'lucide-react'

interface AreaStat {
  area: AreaJuridica
  label: string
  count: number
  color: string
  bg: string
  barColor: string
}

const BAR_COLORS: Record<AreaJuridica, string> = {
  trabalhista: 'bg-blue-500',
  civel: 'bg-purple-500',
  familia: 'bg-pink-500',
  tributario: 'bg-amber-500',
  criminal: 'bg-red-500',
  previdenciario: 'bg-teal-500',
  consumidor: 'bg-emerald-500',
}

export function AreasChart() {
  // Agrupa casos por área jurídica
  const contagem = CASOS.reduce<Record<string, number>>((acc, caso) => {
    acc[caso.areaJuridica] = (acc[caso.areaJuridica] ?? 0) + 1
    return acc
  }, {})

  const stats: AreaStat[] = Object.entries(contagem)
    .map(([area, count]) => ({
      area: area as AreaJuridica,
      label: AREAS_JURIDICAS[area as AreaJuridica].label,
      count,
      color: AREAS_JURIDICAS[area as AreaJuridica].color,
      bg: AREAS_JURIDICAS[area as AreaJuridica].bg,
      barColor: BAR_COLORS[area as AreaJuridica],
    }))
    .sort((a, b) => b.count - a.count)

  const maxCount = Math.max(...stats.map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          Casos por Área
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.map((stat) => (
          <div key={stat.area} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={cn('text-xs font-medium', stat.color)}>{stat.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {stat.count} {stat.count === 1 ? 'caso' : 'casos'}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', stat.barColor)}
                style={{ width: `${(stat.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total de casos</span>
            <span className="font-semibold">{CASOS.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
