import type { Metadata } from 'next'
import { PortalPage } from '@/features/portal/components/PortalPage'

/**
 * `/acompanhar/<token>` — a única rota pública do produto.
 *
 * Não chama banco: quem valida o token é `/api/portal/<token>`, que roda pela
 * service_role depois de conferir link, revogação e cookie de documento. O
 * Server Component fica sendo só a casca — é o que mantém a regra de
 * `lib/supabase/admin.ts` ("service_role só em Route Handler") valendo sem
 * exceção, e o que permite o mesmo componente servir os quatro estados da
 * página sem um round-trip de renderização por estado.
 *
 * `noindex, nofollow`: o link é pessoal. Um buscador que o indexe transforma a
 * credencial do cliente em resultado de pesquisa — e o `nocache`/`noarchive`
 * evita que a versão em cache sobreviva à revogação.
 */
export const metadata: Metadata = {
  title: 'Acompanhamento processual',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
  },
}

/** A página é por definição diferente a cada token e a cada acesso: nada aqui
 * pode ser servido de cache estático. */
export const dynamic = 'force-dynamic'

export default async function AcompanharRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <main className="min-h-dvh bg-background">
      <PortalPage token={token} />
    </main>
  )
}
