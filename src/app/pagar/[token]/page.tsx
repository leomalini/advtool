import type { Metadata } from 'next'
import { BillingPayPage } from '@/features/pagamento/components/BillingPayPage'

/**
 * `/pagar/<token>` — a cobrança que o escritório manda ao cliente
 * (docs/cobrancas.md).
 *
 * Pública, como `/acompanhar` e `/pagamento/retorno`, e pelo mesmo desenho: o
 * Server Component é só a casca e não chama banco — a service_role fica em
 * Route Handler (`/api/pagar/<token>`), regra de `lib/supabase/admin.ts`. É
 * também o que impede a pré-visualização do WhatsApp de contar como abertura:
 * ela lê este HTML, que não traz dado nenhum, e não roda o script.
 *
 * `noindex`, `no-referrer`: o link é pessoal, e o token não pode vazar para o
 * checkout no cabeçalho `Referer`.
 */
export const metadata: Metadata = {
  title: 'Pagamento',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export const dynamic = 'force-dynamic'

export default async function BillingPayRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <main className="min-h-dvh bg-background">
      <BillingPayPage token={token} />
    </main>
  )
}
