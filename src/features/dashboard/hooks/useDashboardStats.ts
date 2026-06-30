'use client'

import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getRecentActivities } from '../services/dashboard.service'

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
