'use client'

import { useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { format, parseISO, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskStatus,
} from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { useTasksForEntity } from '../hooks/useTasks'
import { useCreateTask } from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/12 text-info',
  waiting: 'bg-warning/12 text-warning',
  done: 'bg-success/12 text-success',
}

interface EntityTasksTabProps {
  legalProcessId?: string | null
  crmItemIds?: string[]
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  lockedClientId?: string | null
  itemLabel?: string
}

/** Tarefas tab — shared between the CRM case modal and the Processo modal so both stay identical. */
export function EntityTasksTab({
  legalProcessId,
  crmItemIds,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  itemLabel = 'item',
}: EntityTasksTabProps) {
  const { data: tarefas = [], isLoading, isError } = useTasksForEntity({
    legalProcessId,
    crmItemIds,
  })
  const createTask = useCreateTask()
  const [createOpen, setCreateOpen] = useState(false)

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

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted" />
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
          <p className="text-xs mt-1">Tente fechar e abrir novamente.</p>
        </div>
      </div>
    )
  }

  const pendentes = tarefas.filter((t) => t.status !== 'done').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Tarefas</h3>
          {pendentes > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {pendentes} pendente{pendentes === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
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
        <div className="space-y-2">
          {tarefas.map((tarefa) => {
            const isDone = tarefa.status === 'done'
            const isOverdue =
              !!tarefa.due_date && !isDone && isBefore(parseISO(tarefa.due_date), new Date())
            const assigneeName = tarefa.assignee
              ? getDisplayName(tarefa.assignee.full_name)
              : null

            return (
              <div
                key={tarefa.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border border-border p-3',
                  isDone && 'opacity-60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        STATUS_TONE[tarefa.status]
                      )}
                    >
                      {TASK_STATUS_LABELS[tarefa.status]}
                    </span>
                    <p className={cn('text-sm font-medium truncate', isDone && 'line-through')}>
                      {tarefa.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{TASK_PRIORITY_LABELS[tarefa.priority]}</span>
                    {tarefa.due_date && (
                      <>
                        <span>·</span>
                        <span className={cn(isOverdue && 'text-destructive font-medium')}>
                          {format(parseISO(tarefa.due_date), "dd 'de' MMM", { locale: ptBR })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {assigneeName && (
                  <div
                    title={assigneeName}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold',
                      getAvatarTone(tarefa.assigned_to ?? tarefa.id)
                    )}
                  >
                    {getInitials(assigneeName)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <TaskForm onSubmit={handleCreate} isLoading={createTask.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
