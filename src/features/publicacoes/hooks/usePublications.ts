'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getPublications,
  getPublicationById,
  getPublicationQueue,
  countUnreadPublications,
  markPublicationRead,
  setPublicationHandled,
  updatePublicationFields,
} from '../services/publications.service'
import type { PublicationFilters } from '@/types/publication.types'

export const publicationKeys = {
  all: ['publications'] as const,
  list: (filters: PublicationFilters) => ['publications', 'list', filters] as const,
  detail: (id: string) => ['publications', 'detail', id] as const,
  queue: (onlyUnread: boolean) => ['publications', 'queue', onlyUnread] as const,
  unreadCount: () => ['publications', 'unread-count'] as const,
}

export function usePublications(filters: PublicationFilters = {}) {
  return useQuery({
    queryKey: publicationKeys.list(filters),
    queryFn: () => getPublications(filters),
  })
}

export function usePublication(id: string) {
  return useQuery({
    queryKey: publicationKeys.detail(id),
    queryFn: () => getPublicationById(id),
    enabled: Boolean(id),
  })
}

/** Ordem da fila, para os botões de anterior/próxima na tela de detalhe. */
export function usePublicationQueue(onlyUnread: boolean) {
  return useQuery({
    queryKey: publicationKeys.queue(onlyUnread),
    queryFn: () => getPublicationQueue(onlyUnread),
    // A fila é a espinha da navegação: recarregá-la a cada foco faria o
    // "próxima" apontar para outro lugar no meio da leitura.
    staleTime: 5 * 60 * 1000,
  })
}

export function useUnreadPublicationCount() {
  return useQuery({
    queryKey: publicationKeys.unreadCount(),
    queryFn: countUnreadPublications,
  })
}

function useInvalidatePublications() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: publicationKeys.all })
}

/** Marca como lida ao abrir. Silencioso de propósito: é efeito de leitura, não
 * uma ação que a pessoa pediu, e um toast a cada abertura seria ruído. */
export function useMarkPublicationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => markPublicationRead(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: publicationKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: publicationKeys.unreadCount() })
    },
  })
}

export function useSetPublicationHandled() {
  const invalidate = useInvalidatePublications()

  return useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) =>
      setPublicationHandled(id, handled),
    onSuccess: (_data, { handled }) => {
      invalidate()
      toast.success(handled ? 'Publicação tratada.' : 'Marcação removida.')
    },
    onError: () => toast.error('Não foi possível atualizar a publicação.'),
  })
}

export function useUpdatePublicationFields(id: string) {
  const invalidate = useInvalidatePublications()

  return useMutation({
    mutationFn: (patch: { publication_type?: string | null; subject?: string | null }) =>
      updatePublicationFields(id, patch),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Não foi possível salvar.'),
  })
}

/** Busca as publicações novas das OABs cadastradas nos perfis. */
export function useSyncIntimacoes() {
  const invalidate = useInvalidatePublications()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/buscaprocessos/intimacoes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao buscar publicações.')
      return json as {
        oabs: string[]
        imported: number
        skipped: number
        missingMonitorings: string[]
        estimatedCost: number
      }
    },
    onSuccess: (result) => {
      invalidate()

      if (result.oabs.length === 0) {
        toast.warning('Nenhum perfil tem OAB e UF preenchidas em Configurações.')
        return
      }
      if (result.missingMonitorings.length > 0) {
        toast.warning(
          `Sem monitoramento ativo na BuscaProcessos: ${result.missingMonitorings.join(', ')}.`,
        )
      }
      toast.success(
        result.imported > 0
          ? `${result.imported} publicação(ões) nova(s).`
          : 'Nenhuma publicação nova.',
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
