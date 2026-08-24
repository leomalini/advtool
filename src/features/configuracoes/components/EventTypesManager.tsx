'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ColorPicker, COLOR_SWATCHES } from '@/components/shared/ColorPicker'
import { countEventsOfType } from '@/features/agenda/services/eventTypes.service'
import {
  useEventTypes,
  useCreateEventType,
  useDeleteEventType,
  useUpdateEventType,
} from '@/features/agenda/hooks/useEventTypes'
import type { EventTypeRecord } from '@/types/event.types'
import { Can } from '@/components/shared/Can'

// ── Diálogo de criação/edição ────────────────────────────────────────────────

function TypeFormDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean
  editing: EventTypeRecord | null
  onClose: () => void
}) {
  const createType = useCreateEventType()
  const updateType = useUpdateEventType()

  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0])
  const [seeded, setSeeded] = useState(false)

  // Semeia uma vez por abertura: o diálogo é montado com `open`, então um
  // efeito por render sobrescreveria o que o usuário está digitando.
  if (open && !seeded) {
    setLabel(editing?.label ?? '')
    setColor(editing?.color ?? COLOR_SWATCHES[0])
    setSeeded(true)
  }
  if (!open && seeded) setSeeded(false)

  const isPending = createType.isPending || updateType.isPending

  async function handleSubmit() {
    const trimmed = label.trim()
    if (!trimmed || isPending) return

    if (editing) {
      await updateType.mutateAsync({ id: editing.id, label: trimmed, color })
    } else {
      await createType.mutateAsync({ label: trimmed, color })
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar tipo' : 'Novo tipo de evento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Nome
            </label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder="Ex: Perícia, Sustentação oral"
              maxLength={40}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Cor
            </label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!label.trim() || isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editing ? 'Salvar' : 'Criar tipo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo de exclusão ──────────────────────────────────────────────────────

/**
 * Exclusão com o custo à vista.
 *
 * A FK de `events.type` é RESTRICT, então um tipo em uso simplesmente não pode
 * sair — e descobrir isso só depois de clicar "Excluir" seria hostil. O diálogo
 * consulta a contagem antes e desabilita a ação, dizendo quantos eventos
 * precisam ser reclassificados.
 */
function DeleteTypeDialog({
  type,
  onClose,
}: {
  type: EventTypeRecord | null
  onClose: () => void
}) {
  const deleteType = useDeleteEventType()

  const { data: usage, isLoading } = useQuery({
    queryKey: ['event_types', 'usage', type?.id],
    queryFn: () => countEventsOfType(type!.id),
    enabled: !!type,
  })

  if (!type) return null

  const inUse = (usage ?? 0) > 0

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            Remover tipo de evento
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : inUse ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{type.label}</span> está em uso por{' '}
            <span className="font-medium text-foreground">{usage} evento(s)</span>. Reclassifique
            esses eventos antes de remover o tipo.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Remover <span className="font-medium text-foreground">{type.label}</span>? Nenhum evento
            usa este tipo, então nada é perdido.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {inUse ? 'Entendi' : 'Cancelar'}
          </Button>
          {!inUse && !isLoading && (
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteType.isPending}
              onClick={async () => {
                await deleteType.mutateAsync(type.id)
                onClose()
              }}
            >
              {deleteType.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Remover
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Aba ──────────────────────────────────────────────────────────────────────

export function EventTypesManager() {
  const { data: types = [], isLoading } = useEventTypes()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EventTypeRecord | null>(null)
  const [deleting, setDeleting] = useState<EventTypeRecord | null>(null)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(type: EventTypeRecord) {
    setEditing(type)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Tipos de Evento</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Classificam os eventos da agenda e definem a cor no calendário
          </p>
        </div>
        <Can resource="configuracoes" action="manage">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo Tipo
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground rounded-xl border border-dashed">
          <CalendarDays className="h-7 w-7" />
          <p className="text-sm font-medium">Nenhum tipo cadastrado</p>
          <p className="text-xs">Sem tipos, não é possível criar eventos na agenda.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
            <span>Tipo</span>
            <span />
          </div>
          <div className="divide-y">
            {types.map((type) => (
              <div
                key={type.id}
                className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 items-center hover:bg-muted/20 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openEdit(type)}
                  className="flex items-center gap-2.5 text-left min-w-0"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="text-sm font-medium truncate">{type.label}</span>
                  {type.is_system && (
                    <span className="text-[10px] text-muted-foreground shrink-0">padrão</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setDeleting(type)}
                  aria-label={`Remover ${type.label}`}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <TypeFormDialog open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
      <DeleteTypeDialog type={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
