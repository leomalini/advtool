// Server-side. O link "Não quero mais receber estes resumos".
import { timingSafeEqual } from 'node:crypto'
import { derivePortalKeyBytes } from '@/lib/clientPortal/secret'
import { toBase64Url } from '@/lib/clientPortal/token'

/**
 * Rótulo próprio na derivação: a chave que assina o descadastro não serve
 * para nada do portal (cookie, cofre do token), nem o contrário — ver
 * `lib/clientPortal/secret.ts`. O `v1` deixa trocar o esquema sem reaproveitar
 * assinaturas antigas.
 */
const KEY_INFO = 'advtool:email:unsubscribe:v1'

/** Caminho da página que pede a confirmação (pública — `lib/supabase/middleware.ts`). */
export const UNSUBSCRIBE_PAGE_PATH = '/descadastrar'
/** A rota que efetiva — a do botão da página e a do descadastro em um clique
 * (RFC 8058) que Gmail e Outlook fazem pelo cabeçalho `List-Unsubscribe`. */
export const UNSUBSCRIBE_API_PATH = '/api/email/descadastrar'

let cachedKey: Promise<CryptoKey> | null = null

function signingKey(): Promise<CryptoKey> {
  cachedKey ??= derivePortalKeyBytes(KEY_INFO).then((raw) =>
    crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  )
  return cachedKey
}

/**
 * O token de um cliente: HMAC do id. Sem estado no banco — não expira e não
 * precisa ser guardado —, e só quem tem o segredo do servidor produz um
 * válido. O pior que um token vazado permite é desligar o resumo daquele
 * cliente, que é exatamente o que o link faz.
 */
export async function unsubscribeToken(clientId: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(`unsubscribe:${clientId}`),
  )
  return toBase64Url(new Uint8Array(signature))
}

export async function isValidUnsubscribeToken(clientId: string, token: string): Promise<boolean> {
  const expected = Buffer.from(await unsubscribeToken(clientId))
  const received = Buffer.from(token)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function query(clientId: string, token: string): string {
  return new URLSearchParams({ c: clientId, t: token }).toString()
}

/** O link do rodapé: abre uma página que pede confirmação. Abrir não desliga
 * nada — antivírus de e-mail visitam os links da mensagem sozinhos. */
export function unsubscribePageUrl(origin: string, clientId: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${UNSUBSCRIBE_PAGE_PATH}?${query(clientId, token)}`
}

/** O endereço do `List-Unsubscribe`: o provedor faz POST nele, sem página. */
export function unsubscribeApiUrl(origin: string, clientId: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${UNSUBSCRIBE_API_PATH}?${query(clientId, token)}`
}
