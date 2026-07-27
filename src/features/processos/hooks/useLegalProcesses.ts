'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getLegalProcesses,
  getLegalProcessById,
  getLegalProcessesByClient,
  getRecentMovements,
} from '../services/legalProcesses.service'

export const legalProcessKeys = {
  all: ['legal_processes'] as const,
  list: () => ['legal_processes', 'list'] as const,
  detail: (id: string) => ['legal_processes', id] as const,
  byClient: (clientId: string) => ['legal_processes', 'client', clientId] as const,
  recentMovements: (limit: number) => ['legal_processes', 'recent-movements', limit] as const,
}

export function useLegalProcesses() {
  return useQuery({
    queryKey: legalProcessKeys.list(),
    queryFn: getLegalProcesses,
  })
}

/** Legal processes linked to a client — used by the client detail modal's "Casos" tab. */
export function useLegalProcessesByClient(clientId: string) {
  return useQuery({
    queryKey: legalProcessKeys.byClient(clientId),
    queryFn: () => getLegalProcessesByClient(clientId),
    enabled: !!clientId,
  })
}

export function useLegalProcess(id: string) {
  return useQuery({
    queryKey: legalProcessKeys.detail(id),
    queryFn: () => getLegalProcessById(id),
    enabled: !!id,
  })
}

export function useRecentMovements(limit = 30) {
  return useQuery({
    queryKey: legalProcessKeys.recentMovements(limit),
    queryFn: () => getRecentMovements(limit),
  })
}
