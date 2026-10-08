import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MetricVariant = 'accent' | 'chart2' | 'warning' | 'success' | 'info'

/** `muted` is the resting tone; the others flag a number that needs attention. */
type MetricTone = 'muted' | 'warning' | 'danger'

const VARIANT_CLASSES: Record<MetricVariant, string> = {
  accent: 'bg-accent text-accent-foreground',
  chart2: 'bg-chart-2/12 text-chart-2',
  warning: 'bg-warning/12 text-warning',
  success: 'bg-success/12 text-success',
  info: 'bg-info/12 text-info',
}

const TONE_CLASSES: Record<MetricTone, string> = {
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  danger: 'text-destructive',
}

interface MetricCardProps {
  label: string
  /** Already formatted (a count or an amount). `null` while it loads. */
  value: string | null
  icon: LucideIcon
  variant: MetricVariant
  /** The screen that lists what the number counts. */
  href: string
  /** Supporting line under the label. */
  hint?: string | null
  hintTone?: MetricTone
  /** Paints the number itself — for counts that are a problem when above zero. */
  valueTone?: Exclude<MetricTone, 'muted'>
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  variant,
  href,
  hint,
  hintTone = 'muted',
  valueTone,
}: MetricCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The Card's own `py-6` stacked on the content padding made a phone
          tile taller than wide once the label wrapped. */}
      <Card className="h-full gap-0 py-0 transition-shadow group-hover:shadow-md">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div className={cn('rounded-xl p-2.5', VARIANT_CLASSES[variant])}>
              <Icon className="h-5 w-5" />
            </div>
            <ArrowUpRight
              aria-hidden
              className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </div>
          <div className="mt-4">
            {value === null ? (
              <Skeleton className="h-9 w-20" />
            ) : (
              <p
                className={cn(
                  'text-2xl font-bold tracking-tight tabular-nums sm:text-3xl',
                  valueTone && TONE_CLASSES[valueTone]
                )}
              >
                {value}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
            {hint && <p className={cn('text-xs mt-1', TONE_CLASSES[hintTone])}>{hint}</p>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
