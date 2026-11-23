'use client'

import { useQuery } from '@tanstack/react-query'
import { getBillingForEntry, getOpenBillings } from '../services/billings.service'

/** Tudo sob ['billings']: pôr no ar, trocar a descrição e encerrar invalidam o
 * prefixo, junto com os links (`useInvalidatePaymentSurfaces`). */
export const billingKeys = {
  all: ['billings'] as const,
  byEntry: (entryId: string) => ['billings', 'entry', entryId] as const,
  open: () => ['billings', 'open'] as const,
}

/** A cobrança de um lançamento e a URL — o detalhe. `null` desliga a consulta
 * (despesa não se cobra). */
export function useBillingForEntry(entryId: string | null) {
  return useQuery({
    queryKey: billingKeys.byEntry(entryId ?? ''),
    queryFn: () => getBillingForEntry(entryId as string),
    enabled: !!entryId,
  })
}

/** As cobranças no ar do escritório — o card financeiro do dashboard. */
export function useOpenBillings() {
  return useQuery({
    queryKey: billingKeys.open(),
    queryFn: getOpenBillings,
    refetchInterval: 60_000,
  })
}
