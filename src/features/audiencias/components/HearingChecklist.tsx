'use client'

import { useState } from 'react'
import { Check, CircleSlash, Ellipsis, ListTodo, Package, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/date'
import { checklistItemSchema } from '@/schemas/hearing.schema'
import {
  checklistProgress,
  isHearingReady,
  type HearingChecklistItem,
  type HearingDetail,
} from '@/types/hearing.types'
import {
  useAddChecklistItem,
  useRemoveChecklistItem,
  useSetChecklistItemState,
  useSetReadyOverride,
} from '../hooks/useHearings'
import { checklistDueLabel } from '../utils/display'

/** Os prazos que o "acrescentar item" oferece. Lista curta de propósito: o
 * modelo, em Configurações, aceita qualquer número de dias. */
const OFFSET_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'Sem prazo' },
  { value: '0', label: 'No dia' },
  { value: '1', label: 'D-1' },
  { value: '2', label: 'D-2' },
  { value: '3', label: 'D-3' },
  { value: '5', label: 'D-5' },
  { value: '7', label: 'D-7' },
  { value: '10', label: 'D-10' },
  { value: '15', label: 'D-15' },
  { value: '30', label: 'D-30' },
]

interface HearingChecklistProps {
  hearing: HearingDetail
  canUpdate: boolean
}

/**
 * O checklist da audiência. Marcar um item conclui a tarefa que ele criou, e
 * concluir a tarefa em Tarefas marca o item — o banco mantém os dois juntos
 * (migration 77).
 */
export function HearingChecklist({ hearing, canUpdate }: HearingChecklistProps) {
  const setReady = useSetReadyOverride()

  if (!hearing.checklist_generated_at) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hearing.status === 'a_designar'
          ? 'O checklist nasce quando a data for informada.'
          : hearing.status === 'designada'
            ? 'O checklist nasce quando a data for conferida nos autos: tarefa com prazo calculado sobre uma data mal lida é pior que tarefa nenhuma.'
            : 'Esta audiência foi encerrada sem checklist.'}
      </p>
    )
  }

  const { resolved, total } = checklistProgress(hearing)
  const ready = isHearingReady(hearing)
  const open = hearing.status === 'designada'
  const pct = total === 0 ? 100 : Math.round((resolved / total) * 100)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium tabular-nums">
            {resolved} de {total} resolvido{total === 1 ? '' : 's'}
          </span>
          {ready && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">
              <Check aria-hidden className="h-2.5 w-2.5" />
              Pronta
            </span>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Checklist resolvido"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full transition-[width]', ready ? 'bg-success' : 'bg-info')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {hearing.checklist.length > 0 && (
        <ul className="space-y-1">
          {hearing.checklist.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              startAt={hearing.event?.start_at ?? null}
              canUpdate={canUpdate && open}
            />
          ))}
        </ul>
      )}

      {canUpdate && open && <AddChecklistItem hearingId={hearing.id} />}

      {/* A exceção do Quadro: pronta com itens em aberto ("não se aplica"
          resolve item a item; isto resolve a audiência inteira). */}
      {canUpdate && open && hearing.ready_override_at && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span>Marcada como pronta em {formatDateTime(hearing.ready_override_at)}</span>
          <Button
            size="xs"
            variant="ghost"
            disabled={setReady.isPending}
            onClick={() => setReady.mutate({ id: hearing.id, ready: false })}
          >
            Desfazer
          </Button>
        </div>
      )}
      {canUpdate && open && !ready && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={setReady.isPending}
          onClick={() => setReady.mutate({ id: hearing.id, ready: true })}
        >
          <Check className="mr-1 h-3 w-3" />
          Marcar como pronta mesmo assim
        </Button>
      )}
    </div>
  )
}

function ChecklistRow({
  item,
  startAt,
  canUpdate,
}: {
  item: HearingChecklistItem
  startAt: string | null
  canUpdate: boolean
}) {
  const setState = useSetChecklistItemState()
  const remove = useRemoveChecklistItem()
  const done = !!item.done_at
  const skipped = !!item.skipped_at
  const due = checklistDueLabel(item, startAt)
  const busy = setState.isPending || remove.isPending

  return (
    <li className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/40">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Desmarcar: ${item.label}` : `Marcar como feito: ${item.label}`}
        disabled={!canUpdate || skipped || busy}
        onClick={() => setState.mutate({ itemId: item.id, state: done ? 'pending' : 'done' })}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          done ? 'border-success bg-success text-white' : 'border-input bg-background',
        )}
      >
        {done && <Check aria-hidden className="size-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-xs leading-snug',
            done && 'text-muted-foreground line-through',
            skipped && 'text-muted-foreground italic',
          )}
        >
          {item.label}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
          {skipped && <span>não se aplica</span>}
          {!skipped && due && <span className="tabular-nums">{due}</span>}
          {item.task_id && (
            <span className="inline-flex items-center gap-0.5" title="Tem tarefa no módulo de Tarefas">
              <ListTodo aria-hidden className="h-2.5 w-2.5" />
              tarefa
            </span>
          )}
          {item.client_brings && (
            <span className="inline-flex items-center gap-0.5" title="Entra no que o cliente leva">
              <Package aria-hidden className="h-2.5 w-2.5" />
              cliente leva
            </span>
          )}
        </p>
      </div>

      {canUpdate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Ações do item: ${item.label}`}
              className="opacity-60 group-hover:opacity-100"
              disabled={busy}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {skipped ? (
              <DropdownMenuItem onSelect={() => setState.mutate({ itemId: item.id, state: 'pending' })}>
                <RotateCcw className="h-3.5 w-3.5" />
                Voltar a valer
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setState.mutate({ itemId: item.id, state: 'skipped' })}>
                <CircleSlash className="h-3.5 w-3.5" />
                Não se aplica
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => remove.mutate(item.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

function AddChecklistItem({ hearingId }: { hearingId: string }) {
  const add = useAddChecklistItem()
  const [label, setLabel] = useState('')
  const [offset, setOffset] = useState('none')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = checklistItemSchema.safeParse({
      label,
      offset_days: offset === 'none' ? null : Number(offset),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira o item.')
      return
    }
    setError(null)
    add.mutate(
      { hearingId, label: parsed.data.label, offsetDays: parsed.data.offset_days },
      {
        onSuccess: () => {
          setLabel('')
          setOffset('none')
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1" noValidate>
      <div className="flex items-center gap-1.5">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Acrescentar item"
          aria-label="Novo item do checklist"
          className="h-8 flex-1 text-xs"
        />
        <Select value={offset} onValueChange={setOffset}>
          <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Prazo do item">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OFFSET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="icon-sm" variant="outline" aria-label="Acrescentar" disabled={add.isPending}>
          <Plus />
        </Button>
      </div>
      {offset !== 'none' && (
        <p className="text-[10.5px] text-muted-foreground">Com prazo, o item vira tarefa no módulo de Tarefas.</p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
