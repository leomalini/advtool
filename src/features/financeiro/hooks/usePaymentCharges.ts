'use client'

import { useQuery } from '@tanstack/react-query'
import { getPaymentChargesForEntry, getRecentPayments } from '../services/paymentCharges.service'

/** Tudo sob ['payment_charges']: cancelar e estornar invalidam o prefixo, e o
 * aviso de pagamento do sino também (`useRealtimeNotifications`). */
export const paymentChargeKeys = {
  all: ['payment_charges'] as const,
  byEntry: (entryId: string) => ['payment_charges', 'entry', entryId] as const,
  recentPayments: (days: number) => ['payment_charges', 'recent-payments', days] as const,
}

/** Os links de um lançamento — só para o detalhe; a lista embute o resumo. */
export function usePaymentChargesForEntry(entryId: string | null) {
  return useQuery({
    queryKey: paymentChargeKeys.byEntry(entryId ?? ''),
    queryFn: () => getPaymentChargesForEntry(entryId as string),
    enabled: !!entryId,
  })
}

export function useRecentPayments(days: number) {
  return useQuery({
    queryKey: paymentChargeKeys.recentPayments(days),
    queryFn: () => getRecentPayments(days),
    refetchInterval: 60_000,
  })
}
