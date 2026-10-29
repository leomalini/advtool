'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  generateProcessSummaryFromApi,
  getProcessSummary,
  refreshProcessSummaryFromApi,
} from '../services/processSummary.service'

export const processSummaryKeys = {
  detail: (legalProcessId: string) => ['process-summary', legalProcessId] as const,
}

export function useProcessSummary(legalProcessId: string) {
  return useQuery({
    queryKey: processSummaryKeys.detail(legalProcessId),
    queryFn: () => getProcessSummary(legalProcessId),
    enabled: Boolean(legalProcessId),
  })
}

export function useGenerateProcessSummary(legalProcessId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => generateProcessSummaryFromApi(legalProcessId),
    onSuccess: (record) => {
      queryClient.setQueryData(processSummaryKeys.detail(legalProcessId), record)
      toast.success('Resumo atualizado.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o resumo.'),
  })
}

/**
 * Atualização automática ao abrir um processo com novidades (fase 2b; em lote
 * desde a fase 5). Sem toast: o card mostra o resumo novo quando o lote já o
 * tinha pronto, ou diz que a atualização foi pedida (`data.status === 'queued'`).
 */
export function useAutoRefreshProcessSummary(legalProcessId: string) {
  const queryClient = useQueryClient()
  const key = processSummaryKeys.detail(legalProcessId)

  return useMutation({
    mutationFn: () => refreshProcessSummaryFromApi(legalProcessId),
    onSuccess: (outcome) => {
      if (outcome.status === 'refreshed') queryClient.setQueryData(key, outcome.record)
    },
  })
}
