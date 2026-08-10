'use client'

import { useQuery } from '@tanstack/react-query'
import { getDocuments, getDocumentsForEntity } from '../services/documents.service'

/** Tudo sob o prefixo ['documents'] para que uma invalidação alcance a página
 * e as abas dos modais de uma vez. */
export const documentKeys = {
  all: ['documents'] as const,
  forEntity: (
    legalProcessId: string | null,
    crmItemIds: string[],
    clientId: string | null,
    eventId: string | null
  ) =>
    [
      'documents',
      'entity',
      legalProcessId ?? '-',
      crmItemIds.join(','),
      clientId ?? '-',
      eventId ?? '-',
    ] as const,
}

export function useDocuments() {
  return useQuery({
    queryKey: documentKeys.all,
    queryFn: getDocuments,
  })
}

/** Documentos de um caso, processo, cliente ou evento — para a aba dos modais. */
export function useDocumentsForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  eventId?: string | null
}) {
  const legalProcessId = params.legalProcessId ?? null
  const clientId = params.clientId ?? null
  const eventId = params.eventId ?? null
  // Ordenado para a chave ser estável (ver useEventsForEntity).
  const crmItemIds = [...(params.crmItemIds ?? [])].sort()

  return useQuery({
    queryKey: documentKeys.forEntity(legalProcessId, crmItemIds, clientId, eventId),
    queryFn: () => getDocumentsForEntity({ legalProcessId, crmItemIds, clientId, eventId }),
    enabled: !!legalProcessId || crmItemIds.length > 0 || !!clientId || !!eventId,
  })
}
