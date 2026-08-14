'use client'

import { useQuery } from '@tanstack/react-query'
import { getEvents, getEventsForEntity } from '../services/events.service'

/** Every key sits under the ['events'] prefix so a single
 * `invalidateQueries({ queryKey: eventKeys.all })` reaches all of them — and so
 * an unmounted tab query is still marked stale and refetches on next mount. */
export const eventKeys = {
  all: ['events'] as const,
  range: (from: string, to: string) => ['events', from, to] as const,
  /** Events of a processo, including those reached through its crm_items.
   * Ids are sorted by the caller so the key stays stable across fetches. */
  forEntity: (legalProcessId: string | null, crmItemIds: string[], clientId: string | null) =>
    ['events', 'entity', legalProcessId ?? '-', crmItemIds.join(','), clientId ?? '-'] as const,
}

export function useEvents(from?: string, to?: string) {
  return useQuery({
    queryKey: from && to ? eventKeys.range(from, to) : eventKeys.all,
    queryFn: () => getEvents(from, to),
  })
}

/** Events of a caso or processo, for the Agenda tab inside the modals. */
export function useEventsForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
}) {
  const legalProcessId = params.legalProcessId ?? null
  // Sorted so the query key is stable — the embedded crm_items array has no
  // guaranteed order, and an unstable key would thrash the cache.
  const crmItemIds = [...(params.crmItemIds ?? [])].sort()
  const clientId = params.clientId ?? null

  return useQuery({
    queryKey: eventKeys.forEntity(legalProcessId, crmItemIds, clientId),
    queryFn: () => getEventsForEntity({ legalProcessId, crmItemIds, clientId }),
    enabled: !!legalProcessId || crmItemIds.length > 0 || !!clientId,
  })
}
