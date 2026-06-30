'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createEvent, updateEvent, deleteEvent } from '../services/events.service'
import { eventKeys } from './useEvents'
import { useAuth } from '@/hooks/useAuth'
import type { EventFormInput, UpdateEventInput } from '@/schemas/event.schema'

export function useCreateEvent() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: EventFormInput) => createEvent(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
      toast.success('Evento criado!')
    },
    onError: () => toast.error('Erro ao criar evento.'),
  })
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: UpdateEventInput) => updateEvent(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
      toast.success('Evento atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar evento.'),
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
      toast.success('Evento removido.')
    },
    onError: () => toast.error('Erro ao remover evento.'),
  })
}
