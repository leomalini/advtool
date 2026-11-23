'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BillingCheckoutResult, PublicBillingView } from '@/types/billing.types'

const billingPageKey = (token: string) => ['billing_page', token] as const

class BillingPageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingPageError'
  }
}

async function postJson<T>(path: string, fallback: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', cache: 'no-store' })
  } catch {
    throw new BillingPageError('Sem conexão. Confira a internet e tente de novo.')
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  // 404 traz o estado `not_found` no corpo: não é erro para a página.
  if (body && (response.ok || response.status === 404) && !body.error) return body
  throw new BillingPageError(body?.error ?? fallback)
}

/**
 * O estado da cobrança. Query, e não efeito solto, porque a abertura conta uma
 * vez por carga: sem refetch ao voltar o foco, recarregar a página é o que
 * busca de novo (e o servidor não regrava a abertura a cada minuto).
 */
export function useBillingView(token: string) {
  return useQuery({
    queryKey: billingPageKey(token),
    queryFn: () =>
      postJson<PublicBillingView>(
        `/api/pagar/${encodeURIComponent(token)}`,
        'Tente de novo em instantes.',
      ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * O clique em "Pagar". O checkout abre na mesma aba; se a cobrança mudou de
 * estado no meio do caminho (paga, encerrada), a página passa a mostrar isso.
 */
export function useBillingCheckout(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      postJson<BillingCheckoutResult>(
        `/api/pagar/${encodeURIComponent(token)}/checkout`,
        'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
      ),
    onSuccess: (result) => {
      if (result.status === 'redirect') {
        window.location.assign(result.url)
        return
      }
      queryClient.setQueryData<PublicBillingView>(billingPageKey(token), result)
    },
  })
}
