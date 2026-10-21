'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getLegalProcesses,
  getLegalProcessById,
  getLegalProcessesByClient,
  getProcessesByPartyPerson,
  getRecentMovements,
  getLegalProcessDeletionImpact,
  getLegalProcessesPendencies,
} from '../services/legalProcesses.service'

export const legalProcessKeys = {
  all: ['legal_processes'] as const,
  list: () => ['legal_processes', 'list'] as const,
  detail: (id: string) => ['legal_processes', id] as const,
  byClient: (clientId: string) => ['legal_processes', 'client', clientId] as const,
  /** Processos em que o cadastro aparece como parte (migration 78). */
  byParty: (personId: string) => ['legal_processes', 'party', personId] as const,
  recentMovements: (limit: number) => ['legal_processes', 'recent-movements', limit] as const,
  pendencies: ['legal_processes', 'pendencies'] as const,
}

/** What a processo deletion will destroy vs. merely unlink. Only runs while the
 * confirmation is open — it's four count queries. */
export function useLegalProcessDeletionImpact(legalProcessId: string | null) {
  return useQuery({
    queryKey: ['legal_processes', legalProcessId, 'deletion-impact'],
    queryFn: () => getLegalProcessDeletionImpact(legalProcessId!),
    enabled: !!legalProcessId,
  })
}

/** Processos com dado faltando ou parados — alimenta a página /pendencias e o
 * badge da sidebar. */
export function useLegalProcessesPendencies() {
  return useQuery({
    queryKey: legalProcessKeys.pendencies,
    queryFn: getLegalProcessesPendencies,
  })
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

/** Processos em que o cadastro é parte — aba Processos da ficha de pessoa. */
export function useProcessesByPartyPerson(personId: string) {
  return useQuery({
    queryKey: legalProcessKeys.byParty(personId),
    queryFn: () => getProcessesByPartyPerson(personId),
    enabled: !!personId,
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
