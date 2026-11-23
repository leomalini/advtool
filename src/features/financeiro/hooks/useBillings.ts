'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getBillingForEntry,
  getBillingPanel,
  getOpenBillings,
} from '../services/billings.service'

/** Tudo sob ['billings']: pôr no ar, mudar, encerrar e registrar aviso
 * invalidam o prefixo, junto com os links (`useInvalidatePaymentSurfaces`). */
export const billingKeys = {
  all: ['billings'] as const,
  byEntry: (entryId: string) => ['billings', 'entry', entryId] as const,
  open: () => ['billings', 'open'] as const,
  panel: () => ['billings', 'panel'] as const,
}

/** A cobrança de um lançamento, a URL e a régua de hoje — o detalhe. `null`
 * desliga a consulta (despesa não se cobra). */
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

/** A aba Cobranças. Volta a buscar a cada minuto: a fila muda quando alguém
 * do escritório registra um aviso. */
export function useBillingPanel(enabled = true) {
  return useQuery({
    queryKey: billingKeys.panel(),
    queryFn: getBillingPanel,
    enabled,
    refetchInterval: 60_000,
  })
}
