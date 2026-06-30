'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { Task } from '@/types/task.types'
import { formatDate } from '@/utils/date'
import { isBefore, parseISO } from 'date-fns'

interface TaskCardProps {
  task: Task
}

export function TaskCard({ task }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const checklistDone = task.checklist_items?.filter((i) => i.is_done).length ?? 0
  const checklistTotal = task.checklist_items?.length ?? 0
  const isOverdue =
    task.due_date && task.status !== 'done' && isBefore(parseISO(task.due_date), new Date())

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow space-y-2',
        isDragging && 'opacity-50 ring-2 ring-primary',
        task.status === 'done' && 'opacity-60'
      )}
    >
      <p className={cn('text-sm font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>
        {task.title}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span className={cn('flex items-center gap-1', isOverdue && 'text-destructive font-medium')}>
              <Calendar className="h-3 w-3" />
              {formatDate(task.due_date)}
            </span>
          )}
          {checklistTotal > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
        </div>
        {task.assignee && (
          <Avatar className="h-5 w-5 shrink-0">
            <AvatarFallback className="text-[10px]">
              {task.assignee.full_name?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}
