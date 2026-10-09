import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTER_ANIMATION } from '../utils/motion'

/** Tint of an icon chip. On a card it is the card's identity, not a state —
 * the states (late, due, paid) are painted on the data inside. */
export type DashboardTone = 'accent' | 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'muted'

export const TONE_CHIP_CLASSES: Record<DashboardTone, string> = {
  accent: 'bg-accent text-accent-foreground',
  info: 'bg-info/12 text-info',
  warning: 'bg-warning/12 text-warning',
  success: 'bg-success/12 text-success',
  danger: 'bg-destructive/10 text-destructive',
  violet: 'bg-chart-2/12 text-chart-2',
  muted: 'bg-muted text-muted-foreground',
}

/** Padding of a list body: the rows carry their own `px-2`, so the text lines
 * up with the title while the hover background still reaches the edges. */
export const LIST_BODY = 'px-2 pb-2'
/** Padding of a body that is not a list (numbers, a chart). */
export const BLOCK_BODY = 'px-4 pb-4'

interface DashboardCardProps {
  icon: LucideIcon
  tone: DashboardTone
  title: string
  /** Muted text after the title — the month of the Financeiro card, say. */
  subtitle?: string
  /** Right side of the header: a link, a toggle, a status. */
  action?: React.ReactNode
  /** Bottom bar, above a hairline. */
  footer?: React.ReactNode
  /** Placement in the dashboard: `order-*` for the phone layout and the
   * entrance delay. */
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * The frame of every dashboard card. Lighter than the shadcn `Card` (whose
 * `py-6 gap-6` made big boxes around 11px text), and a container: what is
 * inside lays itself out by the card's width (`@md:`, `@xl:`…), not by the
 * window's — the same card sits in the wide column, the narrow one or alone
 * on a phone.
 *
 * The card never takes a height from outside: it is as tall as its content.
 */
export function DashboardCard({
  icon: Icon,
  tone,
  title,
  subtitle,
  action,
  footer,
  className,
  bodyClassName = LIST_BODY,
  children,
}: DashboardCardProps) {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        '@container relative min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm',
        ENTER_ANIMATION,
        className
      )}
    >
      <div className="flex min-h-14 flex-wrap items-center gap-x-2.5 gap-y-2 px-4 pt-3.5 pb-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            TONE_CHIP_CLASSES[tone]
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <h2 id={titleId} className="text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[13px] font-medium text-muted-foreground">{subtitle}</span>
        )}
        {action && <div className="ml-auto flex items-center gap-2.5">{action}</div>}
      </div>

      <div className={bodyClassName}>{children}</div>

      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  )
}
