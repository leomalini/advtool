import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { confirmPayment, trustedReceiptUrl } from '@/lib/infinitepay/confirm'
import { infinitePayRedirectSchema } from '@/lib/infinitepay/schemas'
import type { PaymentReturnResult } from '@/types/paymentCharge.types'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Formatos medidos no spike. Filtrar antes poupa uma consulta à InfinitePay
 * para cada combinação inventada. */
const redirectInput = infinitePayRedirectSchema.extend({
  transaction_nsu: z.uuid(),
  slug: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/),
})

/**
 * POST /api/pagamento/retorno — o cliente voltou do checkout pelo "Continuar".
 *
 * Rota pública, sem sessão: quem chega é o cliente do escritório. A
 * autorização é a mesma do webhook — o `payment_check` com a InfiniteTag
 * guardada na cobrança — e o que volta é o mínimo para a página de
 * agradecimento: valor, método, comprovante e o nome do escritório. Nada do
 * cliente nem do lançamento, porque essa URL pode ser encaminhada.
 *
 * É o segundo caminho de confirmação: se o webhook se perdeu, o retorno basta.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = redirectInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json<PaymentReturnResult>(
      { status: 'not_found', receiptUrl: null, officeName: null },
      { status: 400, headers: NO_STORE },
    )
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json<PaymentReturnResult>(
      { status: 'pending', receiptUrl: null, officeName: null },
      { status: 503, headers: NO_STORE },
    )
  }

  const supabase = createAdminClient()
  const input = parsed.data
  const receiptUrl = trustedReceiptUrl(input.receipt_url, input.transaction_nsu)

  const [outcome, office] = await Promise.all([
    confirmPayment(supabase, {
      orderNsu: input.order_nsu,
      transactionNsu: input.transaction_nsu,
      slug: input.slug,
      receiptUrl: input.receipt_url,
      captureMethod: input.capture_method,
      via: 'redirect',
    }),
    supabase.from('office_settings').select('name').maybeSingle(),
  ])
  const officeName = (office.data as { name: string | null } | null)?.name ?? null

  if (outcome.status === 'invalid') {
    return NextResponse.json<PaymentReturnResult>(
      { status: 'not_found', receiptUrl, officeName },
      { headers: NO_STORE },
    )
  }
  if (outcome.status === 'error') {
    console.error('[infinitepay/retorno] confirmação falhou:', outcome.error)
    return NextResponse.json<PaymentReturnResult>(
      { status: 'pending', receiptUrl, officeName },
      { headers: NO_STORE },
    )
  }

  // `paid_amount`: quem acabou de pagar reconhece o que saiu do bolso, juros do
  // parcelamento incluídos — não o valor da cobrança.
  const { data: transaction } = await supabase
    .from('payment_transactions')
    .select('paid_amount_cents, capture_method, installments, receipt_url')
    .eq('id', outcome.transactionId)
    .maybeSingle()

  const stored = transaction as {
    paid_amount_cents: number
    capture_method: string | null
    installments: number | null
    receipt_url: string | null
  } | null

  return NextResponse.json<PaymentReturnResult>(
    {
      status: 'confirmed',
      paidAmountCents: stored?.paid_amount_cents ?? null,
      captureMethod: stored?.capture_method ?? input.capture_method ?? null,
      installments: stored?.installments ?? null,
      receiptUrl: stored?.receipt_url ?? receiptUrl,
      officeName,
    },
    { headers: NO_STORE },
  )
}
