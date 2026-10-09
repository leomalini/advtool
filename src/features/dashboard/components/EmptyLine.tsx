import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONE_CHIP_CLASSES, type DashboardTone } from './DashboardCard'

interface EmptyLineProps {
  icon: LucideIcon
  tone?: DashboardTone
  title: string
  description?: string
  /** One thing to do about it, at the end of the line. */
  action?: React.ReactNode
  className?: string
}

/**
 * An empty state that takes one line, not a card. "Nothing here" is
 * information, but a card-sized box of it is the empty space the dashboard
 * used to be made of.
 */
export function EmptyLine({
  icon: Icon,
  tone = 'muted',
  title,
  description,
  action,
  className,
}: EmptyLineProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5', className)}>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          TONE_CHIP_CLASSES[tone]
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
