'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createBillingSeries,
  listBillingSeries,
  updateBillingSeries,
  type BillingSeriesAction,
  type BillingSeriesChanges,
  type NewBillingSeries,
  type SeriesSaved,
} from '../services/billingSeries.service'
import { billingKeys } from './useBillings'
import { notifyPaymentLinkError, useInvalidatePaymentSurfaces } from './usePaymentChargeMutations'

/** Debaixo de `billingKeys.all`: invalidar as cobranças atualiza a lista. */
export const billingSeriesKeys = {
  list: () => [...billingKeys.all, 'series'] as const,
}

export function useBillingSeriesList(enabled = true) {
  return useQuery({
    queryKey: billingSeriesKeys.list(),
    queryFn: listBillingSeries,
    enabled,
  })
}

/** O que a série gerou agora — ciclo novo, ou cobrança que não foi ao ar. */
function reportOutcomes(result: SeriesSaved, done: string) {
  const failed = result.outcomes.filter((outcome) => outcome.billingError)
  const created = result.outcomes.length
  const suffix =
    created === 0
      ? ''
      : created === 1
        ? ' O primeiro ciclo já está no Financeiro.'
        : ` ${created} ciclos já estão no Financeiro.`
  toast.success(`${done}${suffix}`)
  if (failed.length > 0) {
    toast.error(`A cobrança não foi ao ar: ${failed[0].billingError}`, { duration: 10_000 })
  }
}

export function useCreateBillingSeries() {
  const invalidate = useInvalidatePaymentSurfaces()
  return useMutation({
    mutationFn: (input: NewBillingSeries) => createBillingSeries(input),
    onSettled: () => invalidate(),
    onSuccess: (result) => reportOutcomes(result, 'Mensalidade criada.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível criar a mensalidade.'),
  })
}

const ACTION_DONE: Record<BillingSeriesAction, string> = {
  pause: 'Mensalidade pausada.',
  resume: 'Mensalidade retomada.',
  end: 'Mensalidade encerrada.',
}

export function useUpdateBillingSeries() {
  const invalidate = useInvalidatePaymentSurfaces()
  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string
      changes: BillingSeriesChanges | { action: BillingSeriesAction }
    }) => updateBillingSeries(id, changes),
    onSettled: () => invalidate(),
    onSuccess: (result, { changes }) =>
      reportOutcomes(
        result,
        'action' in changes ? ACTION_DONE[changes.action] : 'Mensalidade salva.',
      ),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível alterar a mensalidade.'),
  })
}
