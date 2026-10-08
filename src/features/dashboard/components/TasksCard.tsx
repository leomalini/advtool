'use client'

import { useState } from 'react'
import Link from 'next/link'
import { addDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ListChecks } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/utils/profile'
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentProfile } from '@/hooks/useProfiles'
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, type Task } from '@/types/task.types'
import { AgendaTaskCheck } from '@/features/agenda/components/AgendaTaskCheck'
import { taskToAgendaItem } from '@/features/agenda/utils/agendaItem'
import { useTasks } from '@/features/tarefas/hooks/useTasks'
import { TaskDetailModal } from '@/features/tarefas/components/TaskDetailModal'
import { collapseRecurringTasks } from '@/features/tarefas/utils/seriesTasks'
import { isTaskOverdue } from '@/features/tarefas/utils/filterTasks'
import { useCompleteTask } from '../hooks/useCompleteTask'
import { formatCount, pluralize } from '../utils/format'

type Scope = 'mine' | 'office'
type GroupKey = 'overdue' | 'today' | 'upcoming'

const ROWS = 6
const UPCOMING_DAYS = 7
/** The dashboard stays open all day; the board refreshes by mutation. */
const REFRESH_MS = 60_000

const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: 'Atrasadas',
  today: 'Hoje',
  upcoming: `Próximos ${UPCOMING_DAYS} dias`,
}

const SCOPE_LABELS: Record<Scope, string> = { mine: 'Minhas', office: 'Escritório' }

interface DatedTask {
  task: Task
  /** 'yyyy-MM-dd' — every row here has one; the undated only get counted. */
  dueDate: string
}

function byDue(a: DatedTask, b: DatedTask): number {
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    (a.task.due_time ?? '').localeCompare(b.task.due_time ?? '')
  )
}

function dueLabel({ task, dueDate }: DatedTask, group: GroupKey): string {
  const time = task.due_time?.slice(0, 5)
  const day = parseISO(dueDate)
  if (group === 'overdue') return `venceu ${format(day, 'dd/MM')}`
  if (group === 'today') return time ? `hoje até ${time}` : 'hoje'
  const weekday = format(day, 'EEE, dd/MM', { locale: ptBR })
  return time ? `${weekday}, ${time}` : weekday
}

interface TaskRowProps {
  row: DatedTask
  group: GroupKey
  showAssignee: boolean
  onOpen: (task: Task) => void
  onComplete?: (task: Task) => void
}

/** Stretched button, like the agenda rows: the title covers the row and the
 * check sits above it. */
function TaskRow({ row, group, showAssignee, onOpen, onComplete }: TaskRowProps) {
  const { task } = row
  const item = taskToAgendaItem(task)
  const urgent = task.priority === 'high' || task.priority === 'urgent'
  const assigneeName = showAssignee && task.assignee ? getDisplayName(task.assignee.full_name) : null

  return (
    <div className="relative flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring">
      {item && (
        <span className="relative z-10 mt-0.5 flex">
          <AgendaTaskCheck
            item={item}
            onToggle={onComplete ? () => onComplete(task) : undefined}
            className="h-4 w-4 text-muted-foreground"
          />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none"
        >
          {task.title}
        </button>
        <p
          className={cn(
            'truncate text-[11px]',
            group === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {dueLabel(row, group)}
          {assigneeName && ` · ${assigneeName}`}
        </p>
      </div>
      {urgent && (
        <span
          className={cn('mt-0.5 shrink-0 text-[10px] font-semibold', TASK_PRIORITY_COLORS[task.priority])}
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      )}
    </div>
  )
}

interface TasksCardProps {
  className?: string
}

/**
 * What is late, due today and due this week — yours by default, the office's
 * one click away.
 *
 * Same cache as the Tarefas board (`useTasks`), so completing here reflects
 * there, and the same series rule (`collapseRecurringTasks`): of a recurring
 * series only the late occurrences and the next pending one show, or a daily
 * task would fill the card by itself.
 */
export function TasksCard({ className }: TasksCardProps) {
  const { can } = usePermissions()
  const canComplete = can('tarefas', 'update')
  const profile = useCurrentProfile()
  const { data: tasks = [], isLoading, isError } = useTasks({ refetchInterval: REFRESH_MS })
  const completeTask = useCompleteTask()

  const [scope, setScope] = useState<Scope>('mine')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const horizon = format(addDays(new Date(), UPCOMING_DAYS), 'yyyy-MM-dd')

  const pending = collapseRecurringTasks(tasks).filter(
    (task) =>
      task.status !== 'done' && (scope === 'office' || task.assigned_to === profile?.id)
  )
  const dated = pending.flatMap((task) => (task.due_date ? [{ task, dueDate: task.due_date }] : []))
  const undatedCount = pending.length - dated.length

  const grouped: Record<GroupKey, DatedTask[]> = {
    overdue: dated.filter((row) => isTaskOverdue(row.task)).sort(byDue),
    today: dated.filter((row) => row.dueDate === today).sort(byDue),
    upcoming: dated.filter((row) => row.dueDate > today && row.dueDate <= horizon).sort(byDue),
  }

  // Up to ROWS rows in total, the late ones first.
  let budget = ROWS
  let hidden = 0
  const groups: { key: GroupKey; total: number; rows: DatedTask[] }[] = []
  for (const key of ['overdue', 'today', 'upcoming'] as const) {
    const rows = grouped[key]
    const shown = rows.slice(0, Math.max(budget, 0))
    hidden += rows.length - shown.length
    budget -= shown.length
    if (shown.length > 0) groups.push({ key, total: rows.length, rows: shown })
  }

  const selectedTask = selectedTaskId
    ? (tasks.find((task) => task.id === selectedTaskId) ?? null)
    : null

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-warning" />
          Tarefas
        </CardTitle>
        <CardAction>
          <div role="radiogroup" aria-label="De quem" className="flex rounded-md border p-0.5">
            {(['mine', 'office'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={scope === option}
                onClick={() => setScope(option)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  scope === option
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            Não foi possível carregar as tarefas.
          </p>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {scope === 'mine'
              ? `Nada seu atrasado nem para os próximos ${UPCOMING_DAYS} dias.`
              : `Nada atrasado nem para os próximos ${UPCOMING_DAYS} dias.`}
          </p>
        )}

        {groups.map((group) => (
          <section key={group.key} className="space-y-0.5">
            <h3
              className={cn(
                'px-2 text-xs font-semibold',
                group.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {GROUP_LABELS[group.key]} · {formatCount(group.total)}
            </h3>
            <ul>
              {group.rows.map((row) => (
                <li key={row.task.id}>
                  <TaskRow
                    row={row}
                    group={group.key}
                    showAssignee={scope === 'office'}
                    onOpen={(task) => setSelectedTaskId(task.id)}
                    onComplete={canComplete ? completeTask : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
          <Link href="/tarefas" className="font-medium text-foreground hover:underline">
            Ver todas
          </Link>
          {hidden > 0 && <span>e mais {pluralize(hidden, 'tarefa', 'tarefas')}</span>}
          {undatedCount > 0 && <span>{pluralize(undatedCount, 'sem data', 'sem data')}</span>}
        </div>
      </CardContent>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </Card>
  )
}
