'use client'

import { Calendar, CheckSquare, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { Task } from '@/types/task.types'
import { formatDate } from '@/utils/date'
import { getInitials, getDisplayName } from '@/utils/profile'
import { isTaskOverdue } from '../utils/filterTasks'

interface TaskCardProps {
  task: Task
  onClick?: () => void
}

/** Presentational only — drag handling lives in SortableTaskCard, matching the
 * CasoCard/SortableCasoCard split so a click can open the detail modal without
 * fighting the drag listeners. */
export function TaskCard({ task, onClick }: TaskCardProps) {
  const checklistDone = task.checklist_items?.filter((i) => i.is_done).length ?? 0
  const checklistTotal = task.checklist_items?.length ?? 0
  const isOverdue = isTaskOverdue(task)
  const assigneeName = task.assignee ? getDisplayName(task.assignee.full_name) : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-3 space-y-2',
        'hover:shadow-md transition-shadow',
        onClick && 'cursor-pointer',
        isOverdue && 'border-destructive/40',
        task.status === 'done' && 'opacity-60'
      )}
    >
      <p
        className={cn(
          'text-sm font-medium',
          task.status === 'done' && 'line-through text-muted-foreground'
        )}
      >
        {task.title}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <PriorityBadge priority={task.priority} />
        {isOverdue && (
          <span className="inline-flex items-center rounded-full bg-destructive/12 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            Atrasada
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span
              className={cn(
                'flex items-center gap-1',
                isOverdue && 'text-destructive font-medium'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(task.due_date)}
            </span>
          )}
          {checklistTotal > 0 && (
            <span
              className={cn(
                'flex items-center gap-1',
                checklistDone === checklistTotal && 'text-success'
              )}
            >
              <CheckSquare className="h-3 w-3" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {task.description && (
            <MessageSquare className="h-3 w-3" aria-label="Tem descrição" />
          )}
        </div>
        {assigneeName && (
          <Avatar className="h-5 w-5 shrink-0" title={assigneeName}>
            <AvatarFallback className="text-[10px]">
              {getInitials(assigneeName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}
