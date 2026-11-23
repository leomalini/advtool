import { derivePortalKeyBytes } from '@/lib/clientPortal/secret'
import { bytesToHex, toBase64Url } from '@/lib/clientPortal/token'

/**
 * O token de `/pagar/<token>`.
 *
 * Derivado, e não sorteado: o token é o HMAC-SHA256 do id da cobrança com uma
 * chave do servidor. A régua (fase 2 de docs/cobrancas.md) manda a mesma URL
 * em cada aviso, então o servidor precisa remontá-la sempre; guardar o token
 * em claro faria um dump do banco entregar todos os links. Assim o banco guarda
 * só o SHA-256 (`billings.token_hash`), e só quem tem o segredo remonta a URL.
 *
 * A chave sai do mesmo segredo-raiz do portal (`CLIENT_PORTAL_SECRET`, ou a
 * `SUPABASE_SERVICE_ROLE_KEY` na falta dele), por um `info` próprio: não serve
 * para assinar a sessão do portal nem o contrário. Trocar o segredo-raiz muda
 * todos os tokens e tira do ar os links já enviados.
 *
 * 32 bytes em base64url, como o token do portal: o link vai por WhatsApp, e
 * `+`, `/` e `=` quebram em encurtador e em cópia à mão.
 */

const KEY_INFO = 'billing-page-link-v1'

let cachedKey: Promise<CryptoKey> | null = null

function signingKey(): Promise<CryptoKey> {
  cachedKey ??= derivePortalKeyBytes(KEY_INFO).then((raw) =>
    crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  )
  return cachedKey
}

/** O token da cobrança `billingId`. Sempre o mesmo enquanto o segredo não mudar. */
export async function deriveBillingToken(billingId: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(`billing:${billingId}`),
  )
  return toBase64Url(new Uint8Array(signature))
}

/** SHA-256 em hexa — o que `billings.token_hash` guarda. */
export async function hashBillingToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

/** 43 caracteres base64url, o que 32 bytes produzem. Recusar o resto antes de
 * ir ao banco poupa uma consulta a cada varredura. */
export function looksLikeBillingToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}
