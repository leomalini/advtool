'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getDashboardStats,
  getRecentActivities,
  getUpcomingEvents,
  getCasesByLegalArea,
  getUpcomingDeadlines,
  getWorkloadByAssignee,
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
 */
export const dashboardKeys = {
  stats: ['dashboard-stats'] as const,
  activities: ['recent-activities'] as const,
  /** Prefix — covers every `limit` variant. */
  upcomingEvents: ['dashboard-upcoming-events'] as const,
  casesByArea: ['dashboard-cases-by-area'] as const,
  /** Prefix — covers every `limit` variant. */
  upcomingDeadlines: ['dashboard-upcoming-deadlines'] as const,
  workload: ['dashboard-workload'] as const,
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: getDashboardStats,
    refetchInterval: 60_000,
  })
}

export function useRecentActivities() {
  return useQuery({
    queryKey: dashboardKeys.activities,
    queryFn: () => getRecentActivities(20),
    refetchInterval: 30_000,
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
