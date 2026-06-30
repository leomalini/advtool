'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { Plus, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useTasks } from '../hooks/useTasks'
import { useCreateTask, useUpdateTask } from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'
import { TaskColumn } from './TaskColumn'
import { TASK_STATUS_LABELS, type TaskStatus } from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done']

export function TarefasContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const { data: tasks, isLoading } = useTasks()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const columns = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        label: TASK_STATUS_LABELS[status],
        tasks: tasks?.filter((t) => t.status === status).sort((a, b) => a.position - b.position) ?? [],
      })),
    [tasks]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const taskId = active.id as string
    const targetStatus = over.id as TaskStatus

    if (STATUSES.includes(targetStatus)) {
      const stageCount = tasks?.filter((t) => t.status === targetStatus).length ?? 0
      updateTask.mutate({ id: taskId, status: targetStatus, position: stageCount })
    }
  }

  async function handleSubmit(data: CreateTaskInput) {
    await createTask.mutateAsync({ ...data, status: defaultStatus })
    setDialogOpen(false)
  }

  function handleAddTask(status: TaskStatus) {
    setDefaultStatus(status)
    setDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto">
        {STATUSES.map((s) => (
          <div key={s} className="w-60 shrink-0 space-y-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Gerencie as tarefas do escritório</p>
        <Button size="sm" onClick={() => handleAddTask('todo')}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nova Tarefa
        </Button>
      </div>

      {tasks?.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Nenhuma tarefa ainda"
          description='Clique em "Nova Tarefa" para começar.'
          action={
            <Button size="sm" onClick={() => handleAddTask('todo')}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Tarefa
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto flex-1">
            {columns.map((col) => (
              <TaskColumn
                key={col.status}
                status={col.status}
                label={col.label}
                tasks={col.tasks}
                onAddTask={() => handleAddTask(col.status)}
              />
            ))}
          </div>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <TaskForm
            defaultStatus={defaultStatus}
            onSubmit={handleSubmit}
            isLoading={createTask.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
