'use client'

import { useQuery } from '@tanstack/react-query'
import { getLeads, getLeadStages, getLeadMovements, getLeadComments } from '../services/leads.service'

export const leadKeys = {
  all: ['leads'] as const,
  stages: () => ['lead-stages'] as const,
  movements: (leadId: string) => ['lead-movements', leadId] as const,
  comments: (leadId: string) => ['lead-comments', leadId] as const,
}

export function useLeads() {
  return useQuery({
    queryKey: leadKeys.all,
    queryFn: getLeads,
  })
}

export function useLeadStages() {
  return useQuery({
    queryKey: leadKeys.stages(),
    queryFn: getLeadStages,
    staleTime: Infinity,
  })
}

export function useLeadMovements(leadId: string) {
  return useQuery({
    queryKey: leadKeys.movements(leadId),
    queryFn: () => getLeadMovements(leadId),
    enabled: !!leadId,
  })
}

export function useLeadComments(leadId: string) {
  return useQuery({
    queryKey: leadKeys.comments(leadId),
    queryFn: () => getLeadComments(leadId),
    enabled: !!leadId,
  })
}
