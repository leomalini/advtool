/**
 * O segredo-raiz do portal do cliente.
 *
 * Duas coisas derivam dele, e por caminhos separados: a chave que assina o
 * cookie de sessão (`session.ts`) e a que cifra o token guardado
 * (`vault.ts`). Cada uma passa por um `info` próprio, então uma nunca produz
 * material utilizável pela outra.
 *
 * Mora num módulo só porque as duas precisam da MESMA leitura do ambiente:
 * duplicar a regra de precedência entre `CLIENT_PORTAL_SECRET` e
 * `SUPABASE_SERVICE_ROLE_KEY` em dois arquivos é como as duas divergem.
 */

export function portalRootSecret(): string {
  const explicit = process.env.CLIENT_PORTAL_SECRET?.trim()
  if (explicit) return explicit

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceRole) return serviceRole

  throw new Error(
    '[clientPortal] Sem segredo configurado: defina SUPABASE_SERVICE_ROLE_KEY ' +
      '(ou CLIENT_PORTAL_SECRET) no servidor.'
  )
}

/**
 * Bytes de chave para um uso específico, derivados do segredo-raiz.
 *
 * O `info` entra no digest, que é o que separa os usos: trocar o rótulo dá
 * outra chave, e nenhuma delas permite voltar ao segredo-raiz — SHA-256 é de
 * mão única. É a mesma ideia do `info` do HKDF, na forma mais curta que
 * resolve o problema aqui.
 */
export async function derivePortalKeyBytes(info: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${info}:${portalRootSecret()}`)
  )
}
