'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getCrmItemsByWorkflow,
  getCrmItemsByClient,
  getCrmItemById,
  getCrmItemColumnHistory,
  getCrmItemCountsByWorkflow,
} from '../services/crmItems.service'

export const crmItemKeys = {
  all: ['crm_items'] as const,
  counts: () => ['crm_items', 'counts'] as const,
  workflow: (workflowId: string) => ['crm_items', 'workflow', workflowId] as const,
  byClient: (clientId: string) => ['crm_items', 'client', clientId] as const,
  detail: (id: string) => ['crm_items', id] as const,
  columnHistory: (id: string) => ['crm_items', id, 'column-history'] as const,
}

export function useCrmItems(workflowId: string) {
  return useQuery({
    queryKey: crmItemKeys.workflow(workflowId),
    queryFn: () => getCrmItemsByWorkflow(workflowId),
    enabled: !!workflowId,
  })
}

/** All CRM items linked to a client, across every workflow — used by the client detail modal. */
export function useCrmItemsByClient(clientId: string) {
  return useQuery({
    queryKey: crmItemKeys.byClient(clientId),
    queryFn: () => getCrmItemsByClient(clientId),
    enabled: !!clientId,
  })
}

/** Contagem de itens por workflow — usado para os badges das tabs do CRM. */
export function useCrmItemCounts() {
  return useQuery({
    queryKey: crmItemKeys.counts(),
    queryFn: getCrmItemCountsByWorkflow,
  })
}

export function useCrmItem(id: string) {
  return useQuery({
    queryKey: crmItemKeys.detail(id),
    queryFn: () => getCrmItemById(id),
    enabled: !!id,
  })
}

export function useCrmItemColumnHistory(crmItemId: string, enabled = true) {
  return useQuery({
    queryKey: crmItemKeys.columnHistory(crmItemId),
    queryFn: () => getCrmItemColumnHistory(crmItemId),
    enabled: !!crmItemId && enabled,
    retry: false, // don't retry if table doesn't exist yet
  })
}
