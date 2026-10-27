'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  generateProcessSummaryFromApi,
  getProcessSummary,
  refreshProcessSummaryFromApi,
} from '../services/processSummary.service'

/** Quando outra atualização já está em curso (o sync, o webhook), o resumo
 * novo sai em segundos: relê depois disso. */
const BUSY_RETRY_MS = 30_000

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
 * Atualização automática ao abrir um processo com novidades (fase 2b). Sem
 * aviso: o card mostra o resumo novo quando chega, ou continua com o aviso de
 * novidades se o servidor não refez (cedo demais, teto, falha).
 */
export function useAutoRefreshProcessSummary(legalProcessId: string) {
  const queryClient = useQueryClient()
  const key = processSummaryKeys.detail(legalProcessId)

  return useMutation({
    mutationFn: () => refreshProcessSummaryFromApi(legalProcessId),
    onSuccess: (outcome) => {
      if (outcome.status === 'refreshed') {
        queryClient.setQueryData(key, outcome.record)
      } else if (outcome.status === 'skipped' && outcome.reason === 'busy') {
        window.setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), BUSY_RETRY_MS)
      }
    },
  })
}
