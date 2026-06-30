'use client'

import { useQuery } from '@tanstack/react-query'
import { getEvents } from '../services/events.service'

export const eventKeys = {
  all: ['events'] as const,
  range: (from: string, to: string) => ['events', from, to] as const,
}

export function useEvents(from?: string, to?: string) {
  return useQuery({
    queryKey: from && to ? eventKeys.range(from, to) : eventKeys.all,
    queryFn: () => getEvents(from, to),
  })
}
