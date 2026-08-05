'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getFinancialEntries,
  getFinancialEntriesForEntity,
  getFinancialSummary,
  getMonthlyCashFlow,
} from '../services/financialEntries.service'

/** Tudo sob o prefixo ['financial_entries'] para que uma invalidação só alcance
 * as abas dos modais, a página e os agregados. */
export const financialEntryKeys = {
  all: ['financial_entries'] as const,
  forEntity: (legalProcessId: string | null, crmItemIds: string[], clientId: string | null) =>
    [
      'financial_entries',
      'entity',
      legalProcessId ?? '-',
      crmItemIds.join(','),
      clientId ?? '-',
    ] as const,
  summary: ['financial_entries', 'summary'] as const,
  cashFlow: (months: number) => ['financial_entries', 'cash-flow', months] as const,
}

export function useFinancialEntries() {
  return useQuery({
    queryKey: financialEntryKeys.all,
    queryFn: getFinancialEntries,
  })
}

/** Lançamentos de um caso, processo ou cliente — para a aba dos modais. */
export function useFinancialEntriesForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
}) {
  const legalProcessId = params.legalProcessId ?? null
  const clientId = params.clientId ?? null
  // Ordenado para a chave ser estável (ver useEventsForEntity).
  const crmItemIds = [...(params.crmItemIds ?? [])].sort()

  return useQuery({
    queryKey: financialEntryKeys.forEntity(legalProcessId, crmItemIds, clientId),
    queryFn: () => getFinancialEntriesForEntity({ legalProcessId, crmItemIds, clientId }),
    enabled: !!legalProcessId || crmItemIds.length > 0 || !!clientId,
  })
}

export function useFinancialSummary() {
  return useQuery({
    queryKey: financialEntryKeys.summary,
    queryFn: getFinancialSummary,
    refetchInterval: 60_000,
  })
}

export function useMonthlyCashFlow(months = 6) {
  return useQuery({
    queryKey: financialEntryKeys.cashFlow(months),
    queryFn: () => getMonthlyCashFlow(months),
  })
}
