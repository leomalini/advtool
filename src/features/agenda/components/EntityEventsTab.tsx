'use client'

import { useState } from 'react'
import { Calendar, MapPin, Plus, AlertCircle } from 'lucide-react'
import { format, parseISO, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '@/types/event.types'
import type { CalendarEvent } from '@/types/event.types'
import type { EventFormInput } from '@/schemas/event.schema'
import { useEventsForEntity } from '../hooks/useEvents'
import { useCreateEvent } from '../hooks/useEventMutations'
import { EventForm } from './EventForm'
import { EventDetailModal } from './EventDetailModal'

interface EntityEventsTabProps {
  /** The processo this tab belongs to, when opened from the Processo modal. */
  legalProcessId?: string | null
  /** Every crm_item to read from — a processo passes all its linked cards so
   * events created from a sibling card still show up here. */
  crmItemIds?: string[]
  /** Where new events are written. Exactly one of these should be set. */
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  /** Carried into new events so the link is complete from both sides. */
  lockedClientId?: string | null
  itemLabel?: string
}

/** Agenda tab — shared between the CRM case modal and the Processo modal so both stay identical. */
export function EntityEventsTab({
  legalProcessId,
  crmItemIds,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  itemLabel = 'item',
}: EntityEventsTabProps) {
  const { data: eventos = [], isLoading, isError } = useEventsForEntity({
    legalProcessId,
    crmItemIds,
  })
  const createEvent = useCreateEvent()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)

  async function handleCreate(data: EventFormInput) {
    await createEvent.mutateAsync({
      ...data,
      // Written on top of the form values: the link is what this tab is for,
      // and the fields are hidden while locked.
      legal_process_id: lockedLegalProcessId ?? data.legal_process_id,
      crm_item_id: lockedCrmItemId ?? data.crm_item_id,
    })
    setCreateOpen(false)
  }

  const novoButton = (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
    >
      <Plus className="w-3.5 h-3.5" />
      Novo evento
    </button>
  )

  const dialogs = (
    <>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
          <EventForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            isLoading={createEvent.isPending}
            lockedLegalProcessId={lockedLegalProcessId}
            lockedCrmItemId={lockedCrmItemId}
            defaultValues={{ client_id: lockedClientId ?? undefined }}
          />
        </DialogContent>
      </Dialog>

      <EventDetailModal
        event={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  )

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Calendar className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium">Não foi possível carregar a agenda</p>
          <p className="text-xs mt-1">Tente fechar e abrir novamente.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Agenda</h3>
          {eventos.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {eventos.length}
            </span>
          )}
        </div>
        {novoButton}
      </div>

      {eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Calendar className="w-7 h-7" />
          <p className="text-sm">Nenhum evento vinculado</p>
          <p className="text-xs">Audiências, reuniões e prazos deste {itemLabel} aparecem aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {eventos.map((evento) => {
            const start = parseISO(evento.start_at)
            const isPast = isBefore(start, new Date())
            const color = EVENT_TYPE_COLORS[evento.type]

            return (
              <button
                key={evento.id}
                type="button"
                onClick={() => setSelected(evento)}
                className={cn(
                  'w-full flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/40',
                  isPast && 'opacity-60'
                )}
              >
                <span
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: color }}
                    >
                      {EVENT_TYPE_LABELS[evento.type]}
                    </span>
                    <p className="text-sm font-medium truncate">{evento.title}</p>
                    {evento.fatal_deadline && (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {evento.all_day
                      ? format(start, "dd 'de' MMM 'de' yyyy", { locale: ptBR })
                      : format(start, "dd 'de' MMM 'de' yyyy · HH:mm", { locale: ptBR })}
                  </p>
                  {evento.location && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">
                        {evento.location}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {dialogs}
    </div>
  )
}
