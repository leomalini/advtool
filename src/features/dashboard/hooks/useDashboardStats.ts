'use client'

import { useQuery } from '@tanstack/react-query'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import { taskKeys } from '@/features/tarefas/hooks/useTasks'
import {
  getCasesByLegalArea,
  getUpcomingDeadlines,
  getWorkloadByAssignee,
  getProcessCounts,
  getTaskCounts,
  getUnreadOrphanPublicationCount,
  getWebhookMovements,
  getUnreadPublicationsPreview,
  getPublicationsPerDay,
  getWebhookHealth,
  getPortalAccessSummary,
} from '../services/dashboard.service'

/**
 * Dashboard query keys.
 *
 * `refetchInterval` alone is not enough to keep them fresh: it only runs while
 * the query has a mounted observer. With `staleTime: 60_000` and
 * `refetchOnWindowFocus: false` (see lib/query-client.ts), navigating to the
 * dashboard within a minute of a change shows stale data unless something
 * invalidated it.
 *
 * So the keys that matter sit under their domain's prefix, and the
 * invalidations that domain already does reach them — every processo mutation
 * invalidates `legalProcessKeys.all`, every task mutation `taskKeys.all`; the
 * agenda reads the Agenda's own `eventKeys.range()`. Those features don't need
 * to know the dashboard exists. And the bell's Realtime flush
 * (`useRealtimeNotifications`) invalidates the processos and publications
 * prefixes on every notice, so a webhook delivery refreshes the monitoring card
 * by itself.
 */
export const dashboardKeys = {
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
  unreadOrphanPublicationsPreview: [...publicationKeys.unreadCount(), 'orphans-preview'] as const,
  /** Arrivals, not the queue: reading one doesn't change them, a new one does. */
  publicationsPerDay: [...publicationKeys.all, 'dashboard-per-day'] as const,
  webhookMovements: [...legalProcessKeys.all, 'dashboard-webhook-movements'] as const,
  /** Under processos too: registering the processo from the strip's
   * "Cadastrar" has to take it off the strip. */
  webhookHealth: [...legalProcessKeys.all, 'dashboard-webhook-health'] as const,
  /** Own key: accesses are written by the portal, server-side, so nothing on
   * this side invalidates them — the minute refetch does. */
  portalAccess: ['dashboard-portal-access'] as const,
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

/** `enabled` lets a card call the hook unconditionally and read only with the
 * permission of the table behind it. */
interface QueryToggle {
  enabled?: boolean
}

export function useUnreadOrphanPublicationCount({ enabled }: QueryToggle = {}) {
  return useQuery({
    queryKey: dashboardKeys.unreadOrphanPublications,
    queryFn: getUnreadOrphanPublicationCount,
    refetchInterval: 60_000,
    enabled,
  })
}

export function useWebhookMovements({ enabled }: QueryToggle = {}) {
  return useQuery({
    queryKey: dashboardKeys.webhookMovements,
    queryFn: getWebhookMovements,
    refetchInterval: 60_000,
    enabled,
  })
}

export function usePublicationsPerDay() {
  return useQuery({
    queryKey: dashboardKeys.publicationsPerDay,
    queryFn: () => getPublicationsPerDay(),
    refetchInterval: 60_000,
  })
}

/** The head of the unread queue — or of its orphans, for the "Sem processo" tab. */
export function useUnreadPublicationsPreview({
  orphansOnly = false,
  enabled,
}: QueryToggle & { orphansOnly?: boolean } = {}) {
  return useQuery({
    queryKey: orphansOnly
      ? dashboardKeys.unreadOrphanPublicationsPreview
      : dashboardKeys.unreadPublicationsPreview,
    queryFn: () => getUnreadPublicationsPreview({ orphansOnly }),
    refetchInterval: 60_000,
    enabled,
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

export function usePortalAccessSummary() {
  return useQuery({
    queryKey: dashboardKeys.portalAccess,
    queryFn: getPortalAccessSummary,
    refetchInterval: 60_000,
  })
}
