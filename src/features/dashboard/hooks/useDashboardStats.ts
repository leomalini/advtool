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

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 60_000,
  })
}

export function useRecentActivities() {
  return useQuery({
    queryKey: ['recent-activities'],
    queryFn: () => getRecentActivities(20),
    refetchInterval: 30_000,
  })
}

export function useUpcomingEvents(limit = 6) {
  return useQuery({
    queryKey: ['dashboard-upcoming-events', limit],
    queryFn: () => getUpcomingEvents(limit),
    refetchInterval: 60_000,
  })
}

export function useCasesByLegalArea() {
  return useQuery({
    queryKey: ['dashboard-cases-by-area'],
    queryFn: getCasesByLegalArea,
    refetchInterval: 60_000,
  })
}

export function useUpcomingDeadlines(limit = 5) {
  return useQuery({
    queryKey: ['dashboard-upcoming-deadlines', limit],
    queryFn: () => getUpcomingDeadlines(limit),
    refetchInterval: 60_000,
  })
}

export function useWorkloadByAssignee() {
  return useQuery({
    queryKey: ['dashboard-workload'],
    queryFn: getWorkloadByAssignee,
    refetchInterval: 60_000,
  })
}
