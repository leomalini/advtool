'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createEvent,
  updateEvent,
  deleteEvent,
  type EventWriteOptions,
} from '../services/events.service'
import { eventKeys } from './useEvents'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
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
    // Um evento vinculado "cobre" um prazo próximo: sem isto a pendência
    // continuaria listada mesmo depois de agendado o trabalho.
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.pendencies })
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
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ input, options }: { input: UpdateEventInput; options?: EventWriteOptions }) =>
      updateEvent(input, user!.id, options),
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
    mutationFn: ({ id, options }: { id: string; options?: EventWriteOptions }) =>
      deleteEvent(id, options),
    onSuccess: () => {
      invalidate()
      toast.success('Evento removido.')
    },
    onError: () => toast.error('Erro ao remover evento.'),
  })
}
