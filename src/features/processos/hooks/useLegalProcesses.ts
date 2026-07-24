'use client'

import { useQuery } from '@tanstack/react-query'
import { getLegalProcesses, getLegalProcessById, getRecentMovements } from '../services/legalProcesses.service'

export const legalProcessKeys = {
  all: ['legal_processes'] as const,
  list: () => ['legal_processes', 'list'] as const,
  detail: (id: string) => ['legal_processes', id] as const,
  recentMovements: (limit: number) => ['legal_processes', 'recent-movements', limit] as const,
}

export function useLegalProcesses() {
  return useQuery({
    queryKey: legalProcessKeys.list(),
    queryFn: getLegalProcesses,
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
