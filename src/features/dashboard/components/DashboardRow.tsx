import { cn } from '@/lib/utils'

interface DashboardRowProps {
  /** Small-screen columns, e.g. `grid-cols-2`. One column by default. */
  className?: string
  children: React.ReactNode
}

/**
 * A row of dashboard cards. On large screens it splits evenly among the cards
 * actually rendered: each child opens its own column (`grid-flow-col` +
 * `auto-cols-fr`), so a card hidden for lack of permission leaves no hole —
 * no counting of visible cards to pick a `grid-cols-N`.
 *
 * Unequal widths come from spans on the children: `lg:col-span-7` next to
 * `lg:col-span-5` makes twelve equal tracks, 7/12 and 5/12. Alone, the
 * `col-span-7` child creates only its own seven tracks — the whole row.
 */
export function DashboardRow({ className, children }: DashboardRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 lg:grid-cols-none lg:grid-flow-col lg:auto-cols-fr',
        className
      )}
    >
      {children}
    </div>
  )
}
