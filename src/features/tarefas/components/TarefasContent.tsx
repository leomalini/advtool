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
import { useCreateTask, useOptimisticMoveTask } from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'
import { TaskColumn } from './TaskColumn'
import { TaskDetailModal } from './TaskDetailModal'
import { TarefaFilterBar } from './TarefaFilterBar'
import { filterTasks, emptyTaskFilters, type TaskFilters } from '../utils/filterTasks'
import { TASK_STATUS_LABELS, type Task, type TaskStatus } from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done']

function isTaskStatus(value: string): value is TaskStatus {
  return (STATUSES as string[]).includes(value)
}

export function TarefasContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [filters, setFilters] = useState<TaskFilters>(emptyTaskFilters)

  const { data: tasks, isLoading } = useTasks()
  const createTask = useCreateTask()
  const moveTask = useOptimisticMoveTask()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const filtered = useMemo(() => filterTasks(tasks ?? [], filters), [tasks, filters])

  const columns = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        label: TASK_STATUS_LABELS[status],
        tasks: filtered
          .filter((t) => t.status === status)
          .sort((a, b) => a.position - b.position),
      })),
    [filtered]
  )

  // The modal reads from the live list so edits show up without reopening —
  // holding the object from the click would freeze it.
  const openTask = selectedTask
    ? (tasks?.find((t) => t.id === selectedTask.id) ?? null)
    : null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const taskId = active.id as string
    const overId = String(over.id)

    // `over` is the column when dropped on empty space, but the *task* when
    // dropped onto another card — which used to fail the status check and
    // silently discard the move.
    const targetStatus = isTaskStatus(overId)
      ? overId
      : tasks?.find((t) => t.id === overId)?.status

    if (!targetStatus) return

    const current = tasks?.find((t) => t.id === taskId)
    if (!current || current.status === targetStatus) return

    const stageCount = tasks?.filter((t) => t.status === targetStatus).length ?? 0
    moveTask.mutate({ id: taskId, status: targetStatus, position: stageCount })
  }

  async function handleSubmit(data: CreateTaskInput) {
    // The form's own status wins; defaultStatus only seeds it. Overriding it
    // here meant picking a status in the form had no effect.
    await createTask.mutateAsync(data)
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

      {tasks && tasks.length > 0 && (
        <TarefaFilterBar
          filters={filters}
          onChange={setFilters}
          resultCount={filtered.length}
        />
      )}

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
                onTaskClick={setSelectedTask}
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

      <TaskDetailModal
        task={openTask}
        open={!!openTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  )
}
