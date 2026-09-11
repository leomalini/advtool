'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  attachFilesToEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  type EventWriteOptions,
} from '../services/events.service'
import { eventKeys } from './useEvents'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { AttachedDocumentsError } from '@/features/documentos/services/documents.service'
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
    // Anexos entram, saem ou mudam de ocorrência junto com o evento.
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
  }
}

/** Avisa o que foi anexado — o evento em si já foi salvo e tem o próprio toast. */
function reportAttachments(total: number, failed: number) {
  if (total === 0) return
  if (failed === 0) {
    toast.success(total === 1 ? 'Arquivo anexado!' : `${total} arquivos anexados!`)
  } else {
    toast.error(
      failed === total
        ? 'O evento foi salvo, mas os arquivos não foram anexados.'
        : `O evento foi salvo, mas ${failed} de ${total} arquivos não foram anexados.`
    )
  }
}

export function useCreateEvent() {
  const invalidate = useInvalidateEventSurfaces()
  const { user } = useAuth()

  return useMutation({
    // `files`: escolhidos no formulário antes de o evento existir — sobem logo
    // depois de ele ser criado.
    mutationFn: async ({ files = [], ...input }: EventFormInput & { files?: File[] }) => {
      const event = await createEvent(input, user!.id)
      const failed = await attachFilesToEvent(event, files, user!.id)
      return { event, total: files.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      invalidate()
      toast.success('Evento criado!')
      reportAttachments(total, failed)
    },
    onError: () => toast.error('Erro ao criar evento.'),
  })
}

export function useUpdateEvent() {
  const invalidate = useInvalidateEventSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      input,
      options,
      files = [],
    }: {
      input: UpdateEventInput
      options?: EventWriteOptions
      files?: File[]
    }) => {
      await updateEvent(input, user!.id, options)
      // Vínculos do formulário (o que o evento passou a ser), não os antigos.
      const failed = await attachFilesToEvent(
        {
          id: input.id,
          legal_process_id: input.legal_process_id || null,
          client_id: input.client_id || null,
          crm_item_id: input.crm_item_id || null,
        },
        files,
        user!.id
      )
      return { total: files.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      invalidate()
      toast.success('Evento atualizado!')
      reportAttachments(total, failed)
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
    onError: (error) =>
      toast.error(
        // Único erro com mensagem feita para a tela; o resto é detalhe de banco.
        error instanceof AttachedDocumentsError ? error.message : 'Erro ao remover evento.'
      ),
  })
}
