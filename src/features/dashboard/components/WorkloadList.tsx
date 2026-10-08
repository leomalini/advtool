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
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (stats.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Ninguém cadastrado.</p>
  }

  return (
    <ul className="space-y-5">
      {stats.map(({ profile, total, processos, negociacao, tasks: load }) => {
        const nome = getDisplayName(profile.full_name)
        const progresso = Math.round((total / maxTotal) * 100)

        return (
          <li key={profile.id} className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold',
                  getAvatarTone(profile.id)
                )}
              >
                {getInitials(nome)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-none">{nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {profile.oab_number ? `OAB ${profile.oab_number}` : '—'}
                </p>
              </div>
              <span className="text-base font-bold tabular-nums">{total}</span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent-foreground transition-all duration-500"
                style={{ width: `${progresso}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-info" />
                {processos} em processo
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-chart-2" />
                {negociacao} em negociação
              </span>
              {showTasks && (
                <span>
                  {pluralize(load.open, 'tarefa aberta', 'tarefas abertas')}
                  {load.overdue > 0 && (
                    <span className="font-medium text-destructive">
                      {' · '}
                      {pluralize(load.overdue, 'atrasada', 'atrasadas')}
                    </span>
                  )}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
