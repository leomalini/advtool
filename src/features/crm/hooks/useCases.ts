'use client'

import { useQuery } from '@tanstack/react-query'
import { getCasesByWorkflow, getCaseById, getCaseColumnHistory } from '../services/cases.service'

export const caseKeys = {
  all: ['cases'] as const,
  workflow: (workflowId: string) => ['cases', 'workflow', workflowId] as const,
  detail: (id: string) => ['cases', id] as const,
  columnHistory: (id: string) => ['cases', id, 'column-history'] as const,
}

export function useCases(workflowId: string) {
  return useQuery({
    queryKey: caseKeys.workflow(workflowId),
    queryFn: () => getCasesByWorkflow(workflowId),
    enabled: !!workflowId,
  })
}

export function useCase(id: string) {
  return useQuery({
    queryKey: caseKeys.detail(id),
    queryFn: () => getCaseById(id),
    enabled: !!id,
  })
}

export function useCaseColumnHistory(caseId: string, enabled = true) {
  return useQuery({
    queryKey: caseKeys.columnHistory(caseId),
    queryFn: () => getCaseColumnHistory(caseId),
    enabled: !!caseId && enabled,
    retry: false, // don't retry if table doesn't exist yet
  })
}
