'use client'

import { useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Task, TaskStatus } from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { useTasksForEntity } from '../hooks/useTasks'
import { useCreateTask } from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'
import { TaskBoard, TASK_STATUSES } from './TaskBoard'
import { TaskDetailModal } from './TaskDetailModal'

interface EntityTasksTabProps {
  legalProcessId?: string | null
  crmItemIds?: string[]
  /** O cliente desta aba, quando ela é aberta a partir da página do cliente. */
  clientId?: string | null
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  lockedClientId?: string | null
  itemLabel?: string
}

/**
 * Aba Atividades — o mesmo kanban do módulo Tarefas, sobre o recorte desta
 * entidade. O quadro em si é o `TaskBoard`, compartilhado com a tela de
 * Tarefas: arrastar entre colunas se comporta igual nos dois lugares porque é
 * literalmente o mesmo componente.
 */
export function EntityTasksTab({
  legalProcessId,
  crmItemIds,
  clientId,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  itemLabel = 'item',
}: EntityTasksTabProps) {
  const { data: tarefas = [], isLoading, isError } = useTasksForEntity({
    legalProcessId,
    crmItemIds,
    clientId,
  })
  const createTask = useCreateTask()
  const [createOpen, setCreateOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Lê da lista viva para o modal refletir edições sem precisar reabrir.
  const openTask = selectedTask
    ? (tarefas.find((t) => t.id === selectedTask.id) ?? null)
    : null

  async function handleCreate(data: CreateTaskInput) {
    await createTask.mutateAsync({
      ...data,
      // The link is what this tab is for — applied on top of the form values.
      legal_process_id: lockedLegalProcessId ?? data.legal_process_id,
      crm_item_id: lockedCrmItemId ?? data.crm_item_id,
      client_id: lockedClientId ?? data.client_id,
    })
    setCreateOpen(false)
  }

  function handleAddTask(status: TaskStatus) {
    setDefaultStatus(status)
    setCreateOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto animate-pulse">
        {TASK_STATUSES.map((s) => (
          <div key={s} className="w-60 shrink-0 space-y-3">
            <div className="h-6 w-24 rounded bg-muted" />
            <div className="h-20 w-full rounded-lg bg-muted" />
            <div className="h-20 w-full rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <CheckSquare className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium">Não foi possível carregar as tarefas</p>
          <p className="text-xs mt-1">Tente recarregar a página.</p>
        </div>
      </div>
    )
  }

  const pendentes = tarefas.filter((t) => t.status !== 'done').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Atividades</h3>
          {pendentes > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {pendentes} pendente{pendentes === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleAddTask('todo')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova tarefa
        </button>
      </div>

      {tarefas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <CheckSquare className="w-7 h-7" />
          <p className="text-sm">Nenhuma tarefa vinculada</p>
          <p className="text-xs">As tarefas deste {itemLabel} aparecem aqui</p>
        </div>
      ) : (
        <TaskBoard tasks={tarefas} onAddTask={handleAddTask} onTaskClick={setSelectedTask} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <TaskForm
            defaultStatus={defaultStatus}
            onSubmit={handleCreate}
            isLoading={createTask.isPending}
          />
        </DialogContent>
      </Dialog>

      <TaskDetailModal task={openTask} open={!!openTask} onClose={() => setSelectedTask(null)} />
    </div>
  )
}
