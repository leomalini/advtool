import type { Metadata } from 'next'
import { PaymentReturn } from '@/features/pagamento/components/PaymentReturn'
import type { PaymentReturnParams } from '@/features/pagamento/hooks/usePaymentReturn'

/**
 * `/pagamento/retorno` — para onde a InfinitePay manda o cliente depois do
 * "Continuar" (a `redirect_url` de cada link).
 *
 * Pública, como `/acompanhar`, e pelo mesmo desenho: o Server Component é só a
 * casca e não chama banco — a service_role fica em Route Handler
 * (`/api/pagamento/retorno`), regra de `lib/supabase/admin.ts`.
 *
 * `noindex`: a URL carrega o comprovante do cliente.
 */
export const metadata: Metadata = {
  title: 'Pagamento',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export const dynamic = 'force-dynamic'

function first(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return single?.trim() || null
}

export default async function PaymentReturnRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const orderNsu = first(query.order_nsu)
  const transactionNsu = first(query.transaction_nsu)
  const slug = first(query.slug)

  const params: PaymentReturnParams | null =
    orderNsu && transactionNsu && slug
      ? {
          order_nsu: orderNsu,
          transaction_nsu: transactionNsu,
          slug,
          receipt_url: first(query.receipt_url),
          capture_method: first(query.capture_method),
        }
      : null

  return (
    <main className="min-h-dvh bg-background">
      <PaymentReturn params={params} />
    </main>
  )
}
