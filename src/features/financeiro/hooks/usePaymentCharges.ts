'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getLiveCharges,
  getPaymentChargesForEntry,
  getRecentPayments,
} from '../services/paymentCharges.service'

/** Tudo sob ['payment_charges']: gerar, cancelar e estornar invalidam o prefixo,
 * e o aviso de pagamento do sino também (`useRealtimeNotifications`). */
export const paymentChargeKeys = {
  all: ['payment_charges'] as const,
  byEntry: (entryId: string) => ['payment_charges', 'entry', entryId] as const,
  live: () => ['payment_charges', 'live'] as const,
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

/** Links em aberto do escritório inteiro — o card financeiro do dashboard. */
export function useLiveCharges() {
  return useQuery({
    queryKey: paymentChargeKeys.live(),
    queryFn: getLiveCharges,
    refetchInterval: 60_000,
  })
}

export function useRecentPayments(days: number) {
  return useQuery({
    queryKey: paymentChargeKeys.recentPayments(days),
    queryFn: () => getRecentPayments(days),
    refetchInterval: 60_000,
  })
}
