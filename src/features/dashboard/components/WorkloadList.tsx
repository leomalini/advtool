'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import { useProfiles } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import type { Task } from '@/types/task.types'
import { useTasks } from '@/features/tarefas/hooks/useTasks'
import { collapseRecurringTasks } from '@/features/tarefas/utils/seriesTasks'
import { isTaskOverdue } from '@/features/tarefas/utils/filterTasks'
import { useWorkloadByAssignee } from '../hooks/useDashboardStats'
import { pluralize } from '../utils/format'

const PROCESSOS_WORKFLOW = 'wf-processos'
const NEGOCIACAO_WORKFLOW = 'wf-negociacao'

interface TaskLoad {
  open: number
  overdue: number
}

/** Open and overdue tasks per assignee, with the board's series rule — a daily
 * series would otherwise count a year of occurrences as open work. */
function taskLoadByAssignee(tasks: Task[]): Map<string, TaskLoad> {
  const load = new Map<string, TaskLoad>()
  for (const task of collapseRecurringTasks(tasks)) {
    if (task.status === 'done' || !task.assigned_to) continue
    const entry = load.get(task.assigned_to) ?? { open: 0, overdue: 0 }
    entry.open += 1
    if (isTaskOverdue(task)) entry.overdue += 1
    load.set(task.assigned_to, entry)
  }
  return load
}

/**
 * Cases and tasks per person — the "Pessoas" tab of the team card.
 *
 * Every profile shows up, including those with nothing assigned: an empty row
 * is meaningful information about how work is spread.
 */
export function WorkloadList() {
  const { can } = usePermissions()
  const showTasks = can('tarefas', 'view')
  const { data: profiles = [], isLoading: loadingProfiles } = useProfiles()
  const { data: workload, isLoading: loadingWorkload } = useWorkloadByAssignee()
  // Same cache as the tasks card and the Tarefas board.
  const { data: tasks = [] } = useTasks({ refetchInterval: 60_000, enabled: showTasks })
  const isLoading = loadingProfiles || loadingWorkload

  const taskLoad = taskLoadByAssignee(tasks)
  const stats = profiles
    .map((profile) => {
      const entry = workload?.[profile.id]
      return {
        profile,
        total: entry?.total ?? 0,
        processos: entry?.byWorkflow[PROCESSOS_WORKFLOW] ?? 0,
        negociacao: entry?.byWorkflow[NEGOCIACAO_WORKFLOW] ?? 0,
        tasks: taskLoad.get(profile.id) ?? { open: 0, overdue: 0 },
      }
    })
    .sort((a, b) => b.total - a.total)

  const maxTotal = Math.max(...stats.map((s) => s.total), 1)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (stats.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Ninguém cadastrado.</p>
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3.5">
        {stats.map(({ profile, total, processos, negociacao, tasks: load }) => {
          const nome = getDisplayName(profile.full_name)
          // The bar is the person's share of the busiest person's load, split
          // by what the cases are: a full bar is the heaviest desk.
          const others = Math.max(total - processos - negociacao, 0)

          return (
            <li
              key={profile.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5"
            >
              <div
                className={cn(
                  'row-span-2 flex size-8 shrink-0 items-center justify-center self-start rounded-full text-[11px] font-bold text-white',
                  getAvatarTone(profile.id)
                )}
              >
                {getInitials(nome)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile.oab_number ? `OAB ${profile.oab_number}` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {pluralize(total, 'caso', 'casos')}
                </p>
                {showTasks && (
                  <p className="text-xs whitespace-nowrap text-muted-foreground">
                    {pluralize(load.open, 'tarefa', 'tarefas')}
                    {load.overdue > 0 && (
                      <span className="font-medium text-destructive">
                        {' · '}
                        {pluralize(load.overdue, 'atrasada', 'atrasadas')}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div
                className="col-span-2 flex h-1.5 gap-0.5"
                title={`${processos} em processo · ${negociacao} em negociação`}
              >
                {total === 0 ? (
                  <span className="h-full w-full rounded-full bg-muted" />
                ) : (
                  <>
                    {[
                      { value: processos, className: 'bg-chart-1' },
                      { value: negociacao, className: 'bg-chart-2' },
                      { value: others, className: 'bg-muted-foreground/40' },
                    ]
                      .filter((part) => part.value > 0)
                      .map((part) => (
                        <span
                          key={part.className}
                          className={cn('h-full first:rounded-l-full last:rounded-r-full', part.className)}
                          style={{ width: `${(part.value / maxTotal) * 100}%` }}
                        />
                      ))}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-1" />
          Em processo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-2" />
          Em negociação
        </span>
      </div>
    </div>
  )
}
