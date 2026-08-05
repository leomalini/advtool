'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createEvent, updateEvent, deleteEvent } from '../services/events.service'
import { eventKeys } from './useEvents'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { useAuth } from '@/hooks/useAuth'
import type { EventFormInput, UpdateEventInput } from '@/schemas/event.schema'

/**
 * Every surface that shows event-derived data.
 *
 * Invalidating only ['events'] left the dashboard stale: with
 * `staleTime: 60_000` and `refetchOnWindowFocus: false`, its `refetchInterval`
 * only runs while the dashboard is mounted — so creating an event and
 * navigating there within a minute showed the old numbers.
 */
export function useInvalidateEventSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefix — reaches range() and forEntity() too.
    queryClient.invalidateQueries({ queryKey: eventKeys.all })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.stats })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.upcomingEvents })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
  }
}

export function useCreateEvent() {
  const invalidate = useInvalidateEventSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: EventFormInput) => createEvent(input, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Evento criado!')
    },
    onError: () => toast.error('Erro ao criar evento.'),
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidateEventSurfaces()

  return useMutation({
    mutationFn: (input: UpdateEventInput) => updateEvent(input),
    onSuccess: () => {
      invalidate()
      toast.success('Evento atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar evento.'),
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEventSurfaces()

  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      invalidate()
      toast.success('Evento removido.')
    },
    onError: () => toast.error('Erro ao remover evento.'),
  })
}
