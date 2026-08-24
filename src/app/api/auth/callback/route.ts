import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Tipos de link de e-mail aceitos. Validar em vez de repassar o parâmetro cru
 * segue a regra do projeto de nunca confiar em entrada externa — e `type` vem
 * da query string, que qualquer um edita.
 *
 * `EmailOtpType` do auth-js não é reexportado por `@supabase/supabase-js` nesta
 * versão, e importar da dependência transitiva quebraria num bump. Este union é
 * mais estreito e atribui sem atrito.
 */
const TIPOS_ACEITOS = ['invite', 'recovery', 'signup', 'magiclink', 'email_change'] as const
type TipoLink = (typeof TIPOS_ACEITOS)[number]

function parseTipo(valor: string | null): TipoLink | null {
  return TIPOS_ACEITOS.includes(valor as TipoLink) ? (valor as TipoLink) : null
}

/**
 * Troca o token de um link de e-mail por uma sessão em cookie.
 *
 * Dois formatos, e os DOIS são necessários:
 *
 *   • `token_hash` + `type` → `verifyOtp`. É o caminho do convite e da
 *     recuperação de senha. O convite **não suporta PKCE** — está na doc do
 *     `inviteUserByEmail`, e o motivo é que o browser que convida quase nunca é
 *     o browser que aceita. Sem PKCE, o `{{ .ConfirmationURL }}` padrão faz o
 *     GoTrue devolver os tokens no **fragmento** da URL (`#access_token=…`), que
 *     nunca chega ao servidor: o Route Handler não vê nada e a pessoa cai no
 *     login sem sessão. Por isso os templates de e-mail apontam para cá com
 *     `token_hash` na query — ver `docs/PLANEJAMENTO-MULTIUSUARIO.md` §5, Fase 4.
 *
 *   • `code` → `exchangeCodeForSession`, o fluxo PKCE, mantido para os links
 *     iniciados no próprio browser.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const tipo = parseTipo(requestUrl.searchParams.get('type'))
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')

  // O link de convite chega com `next=/definir-senha`, porque quem entra por
  // convite ainda não tem senha.
  //
  // Só caminhos relativos são aceitos: sem esta checagem, um `next=https://…`
  // transformaria o callback num open redirect — e um redirect que sai de um
  // domínio confiável é exatamente o que dá credibilidade a um phishing.
  // `//host` também é rejeitado: o browser o trata como URL protocol-relative.
  const destino =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  const supabase = await createClient()
  let falha: string | null = null

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
    falha = error?.message ?? null
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    falha = error?.message ?? null
  } else {
    falha = 'link sem token_hash nem code'
  }

  if (falha) {
    // Antes isto seguia em silêncio para `/dashboard`, onde a falta de sessão
    // devolvia a pessoa ao login sem explicação nenhuma. O detalhe fica no log
    // do servidor; o usuário recebe um motivo em português.
    console.error('[auth/callback] falhou:', falha)
    return NextResponse.redirect(new URL('/login?erro=link_invalido', request.url))
  }

  return NextResponse.redirect(new URL(destino, request.url))
}
