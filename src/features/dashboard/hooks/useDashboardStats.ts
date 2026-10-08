'use client'

import { useQuery } from '@tanstack/react-query'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import { taskKeys } from '@/features/tarefas/hooks/useTasks'
import {
  getDashboardStats,
  getCasesByLegalArea,
  getUpcomingDeadlines,
  getWorkloadByAssignee,
  getProcessCounts,
  getTaskCounts,
  getUnreadOrphanPublicationCount,
  getWebhookMovements,
  getUnreadPublicationsPreview,
  getWebhookHealth,
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
 * The indicator counts and the monitoring card take the other route: they sit
 * under their domain's prefix, so the invalidations that domain already does
 * reach them — every processo mutation invalidates `legalProcessKeys.all`,
 * every task mutation `taskKeys.all`. Those features don't need to know the
 * dashboard exists. And the bell's Realtime flush (`useRealtimeNotifications`)
 * invalidates the processos and publications prefixes on every notice, so a
 * webhook delivery refreshes the monitoring card by itself.
 */
export const dashboardKeys = {
  stats: ['dashboard-stats'] as const,
  casesByArea: ['dashboard-cases-by-area'] as const,
  /** Prefix — covers every `limit` variant. */
  upcomingDeadlines: ['dashboard-upcoming-deadlines'] as const,
  workload: ['dashboard-workload'] as const,
  processCounts: [...legalProcessKeys.all, 'dashboard-counts'] as const,
  taskCounts: [...taskKeys.all, 'dashboard-counts'] as const,
  /** Under `unreadCount()` and not just the publications prefix: marking a
   * publication read invalidates only that key (and the detail). */
  unreadOrphanPublications: [...publicationKeys.unreadCount(), 'orphans'] as const,
  /** Same reason: the list has to move together with the count above it. */
  unreadPublicationsPreview: [...publicationKeys.unreadCount(), 'preview'] as const,
  webhookMovements: [...legalProcessKeys.all, 'dashboard-webhook-movements'] as const,
  /** Under processos too: registering the processo from the strip's
   * "Cadastrar" has to take it off the strip. */
  webhookHealth: [...legalProcessKeys.all, 'dashboard-webhook-health'] as const,
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: getDashboardStats,
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

export function useWebhookMovements() {
  return useQuery({
    queryKey: dashboardKeys.webhookMovements,
    queryFn: getWebhookMovements,
    refetchInterval: 60_000,
  })
}

export function useUnreadPublicationsPreview() {
  return useQuery({
    queryKey: dashboardKeys.unreadPublicationsPreview,
    queryFn: () => getUnreadPublicationsPreview(),
    refetchInterval: 60_000,
  })
}

/** Only for `configuracoes:view` — the component that calls it is gated. */
export function useWebhookHealth() {
  return useQuery({
    queryKey: dashboardKeys.webhookHealth,
    queryFn: getWebhookHealth,
    refetchInterval: 60_000,
  })
}
