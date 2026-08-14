'use client'

import { useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { TaskColumn } from './TaskColumn'
import { useOptimisticMoveTask } from '../hooks/useTaskMutations'
import { TASK_STATUS_LABELS, type Task, type TaskStatus } from '@/types/task.types'

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done']

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as string[]).includes(value)
}

interface TaskBoardProps {
  tasks: Task[]
  onAddTask: (status: TaskStatus) => void
  onTaskClick: (task: Task) => void
}

/**
 * O kanban de tarefas.
 *
 * Vive fora do TarefasContent porque as abas Atividades do processo e do
 * cliente mostram o mesmo quadro, sobre um recorte menor de tarefas. A
 * resolução do alvo do arrasto é a parte que não pode divergir: `over.id` é a
 * coluna quando se solta no vazio, mas o **id da tarefa** quando se solta sobre
 * outro card — e tratar só o primeiro caso descartava o movimento em silêncio.
 */
export function TaskBoard({ tasks, onAddTask, onTaskClick }: TaskBoardProps) {
  const moveTask = useOptimisticMoveTask()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const columns = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        status,
        label: TASK_STATUS_LABELS[status],
        tasks: tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position),
      })),
    [tasks]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const taskId = active.id as string
    const overId = String(over.id)

    const targetStatus = isTaskStatus(overId)
      ? overId
      : tasks.find((t) => t.id === overId)?.status

    if (!targetStatus) return

    const current = tasks.find((t) => t.id === taskId)
    if (!current || current.status === targetStatus) return

    const stageCount = tasks.filter((t) => t.status === targetStatus).length
    moveTask.mutate({ id: taskId, status: targetStatus, position: stageCount })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto flex-1">
        {columns.map((col) => (
          <TaskColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={col.tasks}
            onAddTask={() => onAddTask(col.status)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </DndContext>
  )
}
