'use client'

import { useQuery } from '@tanstack/react-query'
import { getPaymentChargesForEntry } from '../services/paymentCharges.service'

export const paymentChargeKeys = {
  all: ['payment_charges'] as const,
  byEntry: (entryId: string) => ['payment_charges', 'entry', entryId] as const,
}

/** Os links de um lançamento — só para o detalhe; a lista embute o resumo. */
export function usePaymentChargesForEntry(entryId: string | null) {
  return useQuery({
    queryKey: paymentChargeKeys.byEntry(entryId ?? ''),
    queryFn: () => getPaymentChargesForEntry(entryId as string),
    enabled: !!entryId,
  })
}
