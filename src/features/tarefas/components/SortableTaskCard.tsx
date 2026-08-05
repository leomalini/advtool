'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskCard } from './TaskCard'
import type { Task } from '@/types/task.types'

interface SortableTaskCardProps {
  task: Task
  onClick: () => void
}

/** Drag wrapper — listeners live here so TaskCard's onClick still fires on a
 * plain click (the sensor's 5px activation constraint separates the two). */
export function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} />
    </div>
  )
}
