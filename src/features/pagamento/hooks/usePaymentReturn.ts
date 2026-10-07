'use client'

import { useQuery } from '@tanstack/react-query'
import type { PaymentReturnResult } from '@/types/paymentCharge.types'

/** Os parâmetros que a InfinitePay acrescenta à `redirect_url`. */
export interface PaymentReturnParams {
  order_nsu: string
  transaction_nsu: string
  slug: string
  receipt_url: string | null
  capture_method: string | null
}

async function confirmReturn(params: PaymentReturnParams): Promise<PaymentReturnResult> {
  const response = await fetch('/api/pagamento/retorno', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    cache: 'no-store',
  })
  const body = (await response.json().catch(() => null)) as PaymentReturnResult | null
  // 503 e falha de rede viram "pendente": o pagamento pode muito bem existir, e
  // a baixa chega pelo webhook.
  return body ?? { status: 'pending', receiptUrl: null, officeName: null }
}

/**
 * A confirmação do retorno. Query, e não mutation, porque é idempotente — a
 * rota só grava o que ainda não está gravado — e porque a página existe para
 * mostrar o resultado dela assim que abre.
 */
export function usePaymentReturn(params: PaymentReturnParams) {
  return useQuery({
    queryKey: ['payment_return', params.transaction_nsu],
    queryFn: () => confirmReturn(params),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
