/** Tipos de link que a gestão de usuários emite. */
export type AccessLinkType = 'invite' | 'recovery'

/**
 * Monta o link de acesso a partir do `hashed_token` devolvido por
 * `generateLink`.
 *
 * ⚠️ **Não use o `action_link` que o Supabase devolve junto.** A doc do próprio
 * tipo descreve o formato dele:
 *
 *     auth/v1/verify?type={verification_type}&token={hashed_token}&redirect_to=…
 *
 * Ou seja, ele passa pelo `/auth/v1/verify` do GoTrue, que — como convite não
 * suporta PKCE — redireciona com os tokens no **fragmento** da URL
 * (`#access_token=…`). Fragmento nunca chega ao servidor: o nosso Route Handler
 * não vê token nenhum e devolve a pessoa ao login.
 *
 * Apontar direto para `/api/auth/callback` com `token_hash` na query resolve,
 * e é a mesma razão pela qual os templates de e-mail usam `{{ .TokenHash }}` em
 * vez de `{{ .ConfirmationURL }}` (ver §9 do planejamento multiusuário).
 */
export function buildAccessLink(
  origin: string,
  hashedToken: string,
  type: AccessLinkType
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: '/definir-senha',
  })

  return `${origin}/api/auth/callback?${params.toString()}`
}
