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
    eventId: string | null,
    financialEntryId: string | null
  ) =>
    [
      'documents',
      'entity',
      legalProcessId ?? '-',
      crmItemIds.join(','),
      clientId ?? '-',
      eventId ?? '-',
      financialEntryId ?? '-',
    ] as const,
}

export function useDocuments() {
  return useQuery({
    queryKey: documentKeys.all,
    queryFn: getDocuments,
  })
}

/** Documentos de um caso, processo, cliente, evento ou lançamento — para a aba
 * dos modais. */
export function useDocumentsForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  eventId?: string | null
  financialEntryId?: string | null
}) {
  const legalProcessId = params.legalProcessId ?? null
  const clientId = params.clientId ?? null
  const eventId = params.eventId ?? null
  const financialEntryId = params.financialEntryId ?? null
  // Ordenado para a chave ser estável (ver useEventsForEntity).
  const crmItemIds = [...(params.crmItemIds ?? [])].sort()

  return useQuery({
    queryKey: documentKeys.forEntity(
      legalProcessId,
      crmItemIds,
      clientId,
      eventId,
      financialEntryId
    ),
    queryFn: () =>
      getDocumentsForEntity({ legalProcessId, crmItemIds, clientId, eventId, financialEntryId }),
    enabled:
      !!legalProcessId ||
      crmItemIds.length > 0 ||
      !!clientId ||
      !!eventId ||
      !!financialEntryId,
  })
}
