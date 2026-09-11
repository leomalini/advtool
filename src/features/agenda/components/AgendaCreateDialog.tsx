'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import type { EventFormInput } from '@/schemas/event.schema'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { TaskForm } from '@/features/tarefas/components/TaskForm'
import { useCreateTask } from '@/features/tarefas/hooks/useTaskMutations'
import { useCreateEvent } from '../hooks/useEventMutations'
import { EventForm } from './EventForm'

type CreateKind = 'event' | 'task'

const KIND_LABELS: Record<CreateKind, { tab: string; title: string }> = {
  event: { tab: 'Evento', title: 'Novo evento' },
  task: { tab: 'Tarefa', title: 'Nova tarefa' },
}

export interface AgendaCreateTarget {
  /** Dia clicado — e a hora, quando o clique veio de um horário da grade. */
  at?: Date
  withTime: boolean
}

interface AgendaCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AgendaCreateTarget
}

/**
 * Criação a partir da Agenda, com as abas Evento | Tarefa do Google Agenda.
 * O dia e a hora clicados valem para as duas abas.
 *
 * Cada aba só aparece para quem pode criar aquele tipo — a RLS recusaria de
 * qualquer jeito, mas oferecer e depois falhar é pior que não oferecer.
 */
export function AgendaCreateDialog({ open, onOpenChange, target }: AgendaCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        {/* O Radix desmonta o conteúdo ao fechar: a aba escolhida volta ao
            padrão a cada abertura, sem precisar resetar estado à mão. */}
        <CreateBody target={target} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CreateBody({ target, onClose }: { target: AgendaCreateTarget; onClose: () => void }) {
  const { can } = usePermissions()
  const canEvent = can('agenda', 'create')
  const canTask = can('tarefas', 'create')
  const [kind, setKind] = useState<CreateKind>(canEvent ? 'event' : 'task')

  const createEvent = useCreateEvent()
  const createTask = useCreateTask()

  const day = target.at ?? new Date()
  const time = target.withTime && target.at ? format(target.at, 'HH:mm') : undefined

  async function handleEvent(data: EventFormInput, files: File[]) {
    await createEvent.mutateAsync({ ...data, files })
    onClose()
  }

  async function handleTask(data: CreateTaskInput) {
    await createTask.mutateAsync(data)
    onClose()
  }

  const header = (
    <KindTabs
      kind={kind}
      onChange={setKind}
      kinds={(['event', 'task'] as const).filter((k) => (k === 'event' ? canEvent : canTask))}
    />
  )

  if (kind === 'event') {
    return (
      <EventForm
        defaultDate={day}
        defaultTime={time}
        headerContent={header}
        onSubmit={handleEvent}
        onCancel={onClose}
        isLoading={createEvent.isPending}
      />
    )
  }

  return (
    <div className="flex flex-col max-h-[90vh]">
      {/* Mesmo cabeçalho do EventForm, para a troca de aba não pular. */}
      <div className="relative shrink-0 px-8 pt-5 pb-4 border-b">
        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-info" />
        <div className="flex items-center justify-between">
          {header}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
        <TaskForm
          defaultValues={{ due_date: format(day, 'yyyy-MM-dd'), due_time: time }}
          onSubmit={handleTask}
          isLoading={createTask.isPending}
        />
      </div>
    </div>
  )
}

function KindTabs({
  kind,
  onChange,
  kinds,
}: {
  kind: CreateKind
  onChange: (kind: CreateKind) => void
  kinds: CreateKind[]
}) {
  return (
    <>
      <DialogTitle className="sr-only">{KIND_LABELS[kind].title}</DialogTitle>
      {kinds.length < 2 ? (
        <span aria-hidden className="text-sm font-semibold">
          {KIND_LABELS[kind].title}
        </span>
      ) : (
        <div role="tablist" aria-label="Tipo" className="flex rounded-lg border p-0.5">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => onChange(k)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                kind === k
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {KIND_LABELS[k].tab}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
