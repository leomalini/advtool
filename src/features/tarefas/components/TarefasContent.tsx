'use client'

import { useState, useMemo } from 'react'
import { Plus, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useTasks } from '../hooks/useTasks'
import { useCreateTask } from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'
import { TaskBoard, TASK_STATUSES } from './TaskBoard'
import { TaskDetailModal } from './TaskDetailModal'
import { TarefaFilterBar } from './TarefaFilterBar'
import { filterTasks, emptyTaskFilters, type TaskFilters } from '../utils/filterTasks'
import type { Task, TaskStatus } from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { Can } from '@/components/shared/Can'

export function TarefasContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [filters, setFilters] = useState<TaskFilters>(emptyTaskFilters)

  const { data: tasks, isLoading } = useTasks()
  const createTask = useCreateTask()

  const filtered = useMemo(() => filterTasks(tasks ?? [], filters), [tasks, filters])

  // The modal reads from the live list so edits show up without reopening —
  // holding the object from the click would freeze it.
  const openTask = selectedTask
    ? (tasks?.find((t) => t.id === selectedTask.id) ?? null)
    : null

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
        {TASK_STATUSES.map((s) => (
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
        <Can resource="tarefas" action="create">
          <Button size="sm" onClick={() => handleAddTask('todo')}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova Tarefa
          </Button>
        </Can>
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
            <Can resource="tarefas" action="create">
              <Button size="sm" onClick={() => handleAddTask('todo')}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nova Tarefa
              </Button>
            </Can>
          }
        />
      ) : (
        <TaskBoard
          tasks={filtered}
          onAddTask={handleAddTask}
          onTaskClick={setSelectedTask}
        />
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
