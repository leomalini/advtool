'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getDigestSubscription,
  runDigestBulk,
  setDigestSubscription,
  type DigestBulkFilter,
} from '../services/digest.service'

export const digestKeys = {
  all: ['email_digest'] as const,
  byClient: (clientId: string) => ['email_digest', clientId] as const,
}

export function useDigestSubscription(clientId: string) {
  return useQuery({
    queryKey: digestKeys.byClient(clientId),
    queryFn: () => getDigestSubscription(clientId),
  })
}

export function useSetDigestSubscription(clientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => setDigestSubscription(clientId, enabled),
    onSuccess: (subscription) => {
      queryClient.setQueryData(digestKeys.byClient(clientId), subscription)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: digestKeys.byClient(clientId) })
    },
  })
}

/**
 * A prévia do recorte. Só lê — é POST porque leva o filtro no corpo. Sempre
 * fresca: entre uma abertura e outra, alguém pode ter ligado à mão ou um
 * cliente pode ter saído.
 */
export function useDigestBulkPreview(filter: DigestBulkFilter, enabled: boolean) {
  return useQuery({
    queryKey: [...digestKeys.all, 'bulk-preview', filter.search, filter.legalArea] as const,
    queryFn: () => runDigestBulk(filter, true),
    enabled,
    staleTime: 0,
    gcTime: 0,
  })
}

/** A ativação invalida a situação de todo cliente aberto em cache. */
export function useEnableDigestBulk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (filter: DigestBulkFilter) => runDigestBulk(filter, false),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: digestKeys.all })
    },
  })
}
