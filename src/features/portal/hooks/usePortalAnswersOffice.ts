'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { OfficePortalAnswers, PortalAnswersRecord } from '../answers/portalAnswersSchema'
import {
  getOfficePortalAnswers,
  prepareOfficePortalAnswers,
  reviewPortalAnswer,
  type PortalAnswerReview,
} from '../services/portalAnswersOffice.service'

export const officePortalAnswersKeys = {
  detail: (legalProcessId: string) => ['portal-answers-office', legalProcessId] as const,
}

/** As respostas do portal de um processo, para a revisão do escritório. Só
 * busca quando o painel abre (`enabled`). */
export function useOfficePortalAnswers(legalProcessId: string, enabled: boolean) {
  return useQuery({
    queryKey: officePortalAnswersKeys.detail(legalProcessId),
    queryFn: () => getOfficePortalAnswers(legalProcessId),
    enabled: enabled && Boolean(legalProcessId),
  })
}

/** Grava o registro novo no cache. Preparar ou revisar deixa as respostas em
 * dia com o portal, então `stale` volta a falso. */
function useStoreRecord(legalProcessId: string) {
  const queryClient = useQueryClient()
  return (record: PortalAnswersRecord, stale = false) =>
    queryClient.setQueryData<OfficePortalAnswers>(
      officePortalAnswersKeys.detail(legalProcessId),
      (current) => ({ enabled: current?.enabled ?? true, record, stale }),
    )
}

export function usePrepareOfficePortalAnswers(legalProcessId: string) {
  const store = useStoreRecord(legalProcessId)
  return useMutation({
    mutationFn: () => prepareOfficePortalAnswers(legalProcessId),
    onSuccess: (record) => {
      store(record)
      toast.success('Respostas do portal em dia.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível preparar as respostas.'),
  })
}

export function useReviewPortalAnswer(legalProcessId: string) {
  const queryClient = useQueryClient()
  const store = useStoreRecord(legalProcessId)
  return useMutation({
    mutationFn: (review: PortalAnswerReview) => reviewPortalAnswer(legalProcessId, review),
    onSuccess: (record) => {
      // Revisar não muda o que o portal mostra: mantém o `stale` que havia.
      const current = queryClient.getQueryData<OfficePortalAnswers>(
        officePortalAnswersKeys.detail(legalProcessId),
      )
      store(record, current?.stale ?? false)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a revisão.'),
  })
}
