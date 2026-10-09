'use client'

import { useState } from 'react'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, CircleCheck, Flag, ListChecks } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/utils/profile'
import { usePermissions } from '@/hooks/usePermissions'
import { useCurrentProfile } from '@/hooks/useProfiles'
import { TASK_PRIORITY_LABELS, type Task } from '@/types/task.types'
import { AgendaTaskCheck } from '@/features/agenda/components/AgendaTaskCheck'
import { taskToAgendaItem } from '@/features/agenda/utils/agendaItem'
import { useTasks } from '@/features/tarefas/hooks/useTasks'
import { TaskDetailModal } from '@/features/tarefas/components/TaskDetailModal'
import { collapseRecurringTasks } from '@/features/tarefas/utils/seriesTasks'
import { isTaskOverdue } from '@/features/tarefas/utils/filterTasks'
import { useCompleteTask } from '../hooks/useCompleteTask'
import { formatCount, pluralize } from '../utils/format'
import { CardLink } from './CardLink'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

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

const SCOPE_OPTIONS = [
  { value: 'mine', label: 'Minhas' },
  { value: 'office', label: 'Escritório' },
] as const satisfies readonly SegmentedOption<Scope>[]

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

/** Only the two that change what to do first; low and medium stay quiet. */
const PRIORITY_PILLS: Partial<Record<Task['priority'], string>> = {
  urgent: 'bg-destructive/10 text-destructive',
  high: 'bg-warning/12 text-warning',
}

function dueLabel({ task, dueDate }: DatedTask, group: GroupKey): string {
  const time = task.due_time?.slice(0, 5)
  const day = parseISO(dueDate)
  if (group === 'overdue') {
    const late = differenceInCalendarDays(new Date(), day)
    return `venceu ${format(day, 'dd/MM')} · há ${pluralize(late, 'dia', 'dias')}`
  }
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
  const priorityPill = PRIORITY_PILLS[task.priority]
  const assigneeName = showAssignee && task.assignee ? getDisplayName(task.assignee.full_name) : null

  return (
    <div className="relative flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring">
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
          className="block w-full truncate text-left text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none"
        >
          {task.title}
        </button>
        <p
          className={cn(
            'truncate text-xs',
            group === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {dueLabel(row, group)}
          {assigneeName && ` · ${assigneeName}`}
        </p>
      </div>
      {priorityPill && (
        <span
          className={cn(
            'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            priorityPill
          )}
        >
          <Flag aria-hidden className="size-3" />
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
  const [expanded, setExpanded] = useState(false)
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

  // Up to ROWS rows in total, the late ones first — all of them once expanded.
  let budget = expanded ? Infinity : ROWS
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

  const scopeToggle = (
    <SegmentedControl
      label="De quem"
      options={SCOPE_OPTIONS}
      value={scope}
      onChange={(next) => {
        setScope(next)
        setExpanded(false)
      }}
    />
  )

  const shownCount = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const toggleLabel =
    hidden > 0 ? `Mostrar mais ${formatCount(hidden)}` : expanded && shownCount > ROWS ? 'Mostrar menos' : null

  return (
    <DashboardCard
      icon={ListChecks}
      tone="warning"
      title="Tarefas"
      action={scopeToggle}
      className={className}
      footer={
        <>
          <span className="flex items-center gap-3">
            {toggleLabel && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1 rounded-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {toggleLabel}
                <ChevronDown
                  aria-hidden
                  className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                />
              </button>
            )}
            {undatedCount > 0 && <span>{pluralize(undatedCount, 'sem data', 'sem data')}</span>}
          </span>
          <CardLink href="/tarefas" strong>
            Ver quadro
          </CardLink>
        </>
      }
    >
      {isLoading && (
        <div className="space-y-2 px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Não foi possível carregar as tarefas.
        </p>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <EmptyLine
          icon={CircleCheck}
          tone="success"
          title="Tudo em dia"
          description={
            scope === 'mine'
              ? `Nada seu atrasado nem para os próximos ${UPCOMING_DAYS} dias.`
              : `Nada atrasado nem para os próximos ${UPCOMING_DAYS} dias.`
          }
        />
      )}

      {groups.map((group) => (
        <section key={group.key}>
          <h3
            className={cn(
              'px-2 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wider',
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

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
      />
    </DashboardCard>
  )
}
