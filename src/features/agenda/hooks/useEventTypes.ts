'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getEventTypes,
  createEventType,
  updateEventType,
  deleteEventType,
  DuplicateEventTypeError,
  EventTypeInUseError,
} from '../services/eventTypes.service'
import type { EventTypeRecord } from '@/types/event.types'

export const eventTypeKeys = {
  all: ['event_types'] as const,
}

export function useEventTypes() {
  return useQuery({
    queryKey: eventTypeKeys.all,
    queryFn: getEventTypes,
    // Muda raramente e é lida por quase toda tela que mostra evento.
    staleTime: 5 * 60_000,
  })
}

/** Índice por id — o formato que as telas consomem para resolver rótulo e cor. */
export function useEventTypeMap(): Map<string, EventTypeRecord> {
  const { data: types = [] } = useEventTypes()
  return useMemo(() => new Map(types.map((t) => [t.id, t])), [types])
}

export function useCreateEventType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createEventType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypeKeys.all })
      toast.success('Tipo de evento criado!')
    },
    onError: (err) => {
      toast.error(
        err instanceof DuplicateEventTypeError ? err.message : 'Erro ao criar tipo de evento.'
      )
    },
  })
}

export function useUpdateEventType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; label?: string; color?: string }) =>
      updateEventType(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypeKeys.all })
      // A cor aparece dentro dos eventos já em cache.
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Tipo atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar tipo.'),
  })
}

export function useDeleteEventType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteEventType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventTypeKeys.all })
      toast.success('Tipo removido.')
    },
    onError: (err) => {
      toast.error(
        err instanceof EventTypeInUseError
          ? `${err.message} Reclassifique-os antes de excluir.`
          : 'Erro ao remover tipo.'
      )
    },
  })
}
