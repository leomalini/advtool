'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskCard } from './TaskCard'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/types/task.types'

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-600',
  waiting: 'bg-amber-100 text-amber-600',
  done: 'bg-green-100 text-green-600',
}

interface TaskColumnProps {
  status: TaskStatus
  label: string
  tasks: Task[]
  onAddTask: () => void
}

export function TaskColumn({ status, label, tasks, onAddTask }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col w-60 shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[status])}>
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddTask}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-lg p-2 space-y-2 min-h-[200px] transition-colors',
          isOver ? 'bg-accent' : 'bg-muted/40'
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-full py-8">
            <p className="text-xs text-muted-foreground">Nenhuma tarefa</p>
          </div>
        )}
      </div>
    </div>
  )
}
