import type { Metadata } from 'next'
import { CircleAlert } from 'lucide-react'
import { isValidUnsubscribeToken } from '@/lib/email/unsubscribe'
import { UnsubscribeConfirm } from '@/features/emails/components/UnsubscribeConfirm'

/**
 * `/descadastrar?c=<cliente>&t=<token>` — o link "Não quero mais receber estes
 * resumos" do rodapé do resumo diário.
 *
 * Pública, como `/acompanhar` e `/pagamento` (`lib/supabase/middleware.ts`).
 * O Server Component só confere o token — conta, sem banco — e mostra a
 * confirmação; quem desliga é a rota `/api/email/descadastrar`, no clique.
 */
export const metadata: Metadata = {
  title: 'Resumo por e-mail',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
}

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function first(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return single?.trim() || null
}

export default async function UnsubscribeRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const clientId = first(query.c)
  const token = first(query.t)

  const valid =
    clientId !== null &&
    token !== null &&
    UUID.test(clientId) &&
    token.length <= 128 &&
    (await isValidUnsubscribeToken(clientId, token))

  return (
    <main className="min-h-dvh bg-background">
      {valid ? (
        <UnsubscribeConfirm clientId={clientId} token={token} />
      ) : (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CircleAlert className="size-6 text-warning" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link não está completo. Abra de novo pelo link no fim do e-mail, ou fale com o
            escritório.
          </p>
        </div>
      )}
    </main>
  )
}
