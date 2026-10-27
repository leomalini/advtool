'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  generateProcessSummaryFromApi,
  getProcessSummary,
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
