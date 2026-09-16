import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Páginas que precisam responder SEM sessão.
 *
 * Quem chega por convite ou por recuperação de senha ainda não tem cookie
 * nenhum — gatear estas rotas manda a pessoa para o login exatamente no
 * momento em que ela está tentando entrar.
 */
const PAGINAS_PUBLICAS = ['/login', '/recuperar-senha']

/**
 * Prefixos que respondem sem sessão E sem redirecionamento para o login.
 *
 * `/acompanhar/<token>` é a página que o CLIENTE do escritório abre. Ela nunca
 * terá cookie de sessão — quem entra lá não é usuário do sistema — e a própria
 * rota faz a autorização dela, pelo token e pelo documento
 * (`lib/clientPortal/access.ts`). Sai do gate antes mesmo da checagem de
 * sessão: chamar `getUser()` aqui seria uma ida à rede por requisição para
 * confirmar a ausência já conhecida de um cookie.
 */
const PREFIXOS_PUBLICOS = ['/acompanhar']

/**
 * Checagem OTIMISTA de sessão, conforme o §4.3 do planejamento multiusuário:
 * decide apenas SE há sessão, nunca QUEM é. A permissão por módulo vive no RLS
 * e no `requirePermission()` de cada `page.tsx`.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Route Handlers ficam fora do gate de sessão ─────────────────────────────
  //
  // Cada um já faz a própria autorização: `requireAdminApi()` nas rotas de
  // administração, HMAC no webhook do BuscaProcessos e o token do link em
  // `/api/auth/callback`. Gatear por sessão aqui devolvia um 307 para /login em
  // vez de executar a rota, o que quebrava dois fluxos:
  //
  //   • o callback do convite e da recuperação de senha — quem clica no link,
  //     por definição, ainda não tem sessão, então a troca do token por sessão
  //     nunca chegava a acontecer;
  //   • o webhook do BuscaProcessos, que é servidor-para-servidor e nunca
  //     manda cookie.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
  }

  if (PREFIXOS_PUBLICOS.some((prefixo) => pathname.startsWith(prefixo))) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublica = pathname === '/' || PAGINAS_PUBLICAS.includes(pathname)

  if (!user && !isPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // `/definir-senha` fica de fora desta lista de propósito: quem chega lá vem
  // do callback e JÁ tem sessão. Tratá-la como pública devolveria a pessoa ao
  // dashboard sem nunca deixá-la escolher a senha.
  if (user && PAGINAS_PUBLICAS.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
