'use client'

import { useQuery } from '@tanstack/react-query'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import { taskKeys } from '@/features/tarefas/hooks/useTasks'
import {
  getDashboardStats,
  getUpcomingEvents,
  getCasesByLegalArea,
  getUpcomingDeadlines,
  getWorkloadByAssignee,
  getProcessCounts,
  getTaskCounts,
  getUnreadOrphanPublicationCount,
} from '../services/dashboard.service'

/**
 * Dashboard query keys, exported so the invalidation helpers in other features
 * can reference them instead of duplicating magic strings — the dashboard reads
 * events, tasks and crm_items, so creating any of those has to reach in here.
 *
 * `refetchInterval` alone is not enough: it only runs while the query has a
 * mounted observer. With `staleTime: 60_000` and `refetchOnWindowFocus: false`
 * (see lib/query-client.ts), navigating to the dashboard within a minute of a
 * change shows stale data unless something invalidated it explicitly.
 *
 * The indicator counts take the other route: they sit under their domain's
 * prefix, so the invalidations that domain already does reach them — every
 * processo mutation invalidates `legalProcessKeys.all`, every task mutation
 * `taskKeys.all`. Those features don't need to know the dashboard exists.
 */
export const dashboardKeys = {
  stats: ['dashboard-stats'] as const,
  /** Prefix — covers every `limit` variant. */
  upcomingEvents: ['dashboard-upcoming-events'] as const,
  casesByArea: ['dashboard-cases-by-area'] as const,
  /** Prefix — covers every `limit` variant. */
  upcomingDeadlines: ['dashboard-upcoming-deadlines'] as const,
  workload: ['dashboard-workload'] as const,
  processCounts: [...legalProcessKeys.all, 'dashboard-counts'] as const,
  taskCounts: [...taskKeys.all, 'dashboard-counts'] as const,
  /** Under `unreadCount()` and not just the publications prefix: marking a
   * publication read invalidates only that key (and the detail). */
  unreadOrphanPublications: [...publicationKeys.unreadCount(), 'orphans'] as const,
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: getDashboardStats,
    refetchInterval: 60_000,
  })
}

export function useUpcomingEvents(limit = 6) {
  return useQuery({
    queryKey: [...dashboardKeys.upcomingEvents, limit],
    queryFn: () => getUpcomingEvents(limit),
    refetchInterval: 60_000,
  })
}

export function useCasesByLegalArea() {
  return useQuery({
    queryKey: dashboardKeys.casesByArea,
    queryFn: getCasesByLegalArea,
    refetchInterval: 60_000,
  })
}

export function useUpcomingDeadlines(limit = 5) {
  return useQuery({
    queryKey: [...dashboardKeys.upcomingDeadlines, limit],
    queryFn: () => getUpcomingDeadlines(limit),
    refetchInterval: 60_000,
  })
}

export function useWorkloadByAssignee() {
  return useQuery({
    queryKey: dashboardKeys.workload,
    queryFn: getWorkloadByAssignee,
    refetchInterval: 60_000,
  })
}

export function useProcessCounts() {
  return useQuery({
    queryKey: dashboardKeys.processCounts,
    queryFn: getProcessCounts,
    refetchInterval: 60_000,
  })
}

export function useTaskCounts() {
  return useQuery({
    queryKey: dashboardKeys.taskCounts,
    queryFn: getTaskCounts,
    refetchInterval: 60_000,
  })
}

export function useUnreadOrphanPublicationCount() {
  return useQuery({
    queryKey: dashboardKeys.unreadOrphanPublications,
    queryFn: getUnreadOrphanPublicationCount,
    refetchInterval: 60_000,
  })
}
