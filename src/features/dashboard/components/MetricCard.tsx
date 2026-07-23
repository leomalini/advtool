import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'

type MetricVariant = 'accent' | 'chart2' | 'warning' | 'success'

const VARIANT_CLASSES: Record<MetricVariant, string> = {
  accent: 'bg-accent text-accent-foreground',
  chart2: 'bg-chart-2/12 text-chart-2',
  warning: 'bg-warning/12 text-warning',
  success: 'bg-success/12 text-success',
}

interface MetricCardProps {
  label: string
  value: number
  icon: LucideIcon
  variant: MetricVariant
  trend?: string
  trendUp?: boolean
}

export function MetricCard({ label, value, icon: Icon, variant, trend, trendUp }: MetricCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn('rounded-xl p-2.5', VARIANT_CLASSES[variant])}>
            <Icon className="h-5 w-5" />
          </div>
          {trend !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                trendUp ? 'text-success' : 'text-destructive'
              )}
            >
              {trendUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend}
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
