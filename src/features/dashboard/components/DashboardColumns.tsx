import { cn } from '@/lib/utils'

interface DashboardColumnsProps {
  /** Cards of the wide column, already filtered by permission. */
  main: React.ReactElement[]
  /** Cards of the narrow column. */
  aside: React.ReactElement[]
}

/**
 * Two independent columns. Each stacks its own cards at their own height, so
 * a short card never stretches to match its neighbour — the row grid this
 * replaces did exactly that, and an empty agenda grew a blank block as tall as
 * the monitoring card. The columns may end at different heights; that happens
 * at the bottom of the page, where it does no harm.
 *
 * On a narrow dashboard both columns turn into `display: contents` and the
 * cards flow in a single column, ordered by the `order-*` each one carries —
 * the two columns interleave without a second tree. A role whose cards all
 * fall in one column gets that column at full width.
 *
 * Breakpoints read the dashboard's own width (`@container/dashboard`), which
 * moves with the sidebar.
 */
export function DashboardColumns({ main, aside }: DashboardColumnsProps) {
  const split = main.length > 0 && aside.length > 0
  const column = cn(
    'contents',
    split && '@4xl/dashboard:flex @4xl/dashboard:min-w-0 @4xl/dashboard:flex-col @4xl/dashboard:gap-4'
  )

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        split &&
          '@4xl/dashboard:grid @4xl/dashboard:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] @4xl/dashboard:items-start'
      )}
    >
      <div className={column}>{main}</div>
      <div className={column}>{aside}</div>
    </div>
  )
}
