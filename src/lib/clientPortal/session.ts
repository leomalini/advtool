/**
 * A sessão do portal: "este navegador já provou o CPF deste link".
 *
 * O link sozinho não abre a página. O cliente digita o próprio CPF/CNPJ uma
 * vez, e a partir daí o navegador carrega um cookie assinado que dispensa a
 * digitação por 30 dias. É o que transforma "quem tem o link vê tudo" em "quem
 * tem o link E conhece o documento vê" — relevante porque o link circula por
 * WhatsApp, e WhatsApp é encaminhado.
 *
 * ── Por que um cookie assinado, e não uma tabela de sessões ──
 * A tabela precisaria de expurgo, índice e uma escrita a cada acesso. O cookie
 * assinado não guarda estado nenhum no servidor e responde à única pergunta
 * que importa. Revogação continua imediata: quem valida o cookie confere o
 * `revoked_at` do link no banco a cada requisição — o cookie diz "provou o
 * documento", nunca "pode entrar".
 *
 * ── Por que a chave é DERIVADA da service_role ──
 * Uma variável de ambiente a mais é uma variável a mais para faltar em
 * produção e derrubar a página. A chave de assinatura sai de um HMAC sobre a
 * `SUPABASE_SERVICE_ROLE_KEY`, que é obrigatória para o portal funcionar de
 * qualquer forma: HMAC é de mão única, então a chave derivada não permite
 * recuperar a original nem assinar nada fora deste domínio. Rotacionar a
 * service_role invalida as sessões — o efeito é o cliente digitar o documento
 * de novo. Quem preferir separar os segredos preenche `CLIENT_PORTAL_SECRET`.
 */

import { bytesToHex } from './token'

/** 30 dias. Prazo do cookie, não do link. */
export const PORTAL_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export const PORTAL_SESSION_COOKIE = 'portal_session'

/** Separa a derivação de qualquer outro uso futuro da mesma chave-mãe. */
const KEY_INFO = 'advtool:client-portal:session:v1'

let cachedKey: Promise<CryptoKey> | null = null

function rootSecret(): string {
  const explicit = process.env.CLIENT_PORTAL_SECRET?.trim()
  if (explicit) return explicit

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceRole) return `${KEY_INFO}:${serviceRole}`

  throw new Error(
    '[clientPortal/session] Sem segredo para assinar a sessão: configure ' +
      'SUPABASE_SERVICE_ROLE_KEY (ou CLIENT_PORTAL_SECRET) no servidor.'
  )
}

function signingKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(rootSecret()) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return cachedKey
}

async function sign(payload: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    await signingKey(),
    new TextEncoder().encode(payload)
  )
  return bytesToHex(new Uint8Array(mac))
}

/** Comparação em tempo constante, mesmo motivo de `signature.ts`. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Valor do cookie: `<linkId>.<expiraEm>.<assinatura>`.
 *
 * O `linkId` dentro do payload é o que impede o cookie de um cliente valer no
 * link de outro: quem valida exige que ele bata com o link da URL. Sem isso,
 * um cookie legítimo abriria qualquer `/acompanhar/<token>` que existisse.
 */
export async function createPortalSessionCookie(linkId: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + PORTAL_SESSION_MAX_AGE_SECONDS
  const payload = `${linkId}.${expiresAt}`
  return `${payload}.${await sign(payload)}`
}

/** `true` só quando a assinatura confere, não expirou e é deste link. */
export async function verifyPortalSessionCookie(
  value: string | undefined,
  linkId: string
): Promise<boolean> {
  if (!value) return false

  const parts = value.split('.')
  if (parts.length !== 3) return false

  const [cookieLinkId, expiresAtRaw, signature] = parts
  if (cookieLinkId !== linkId) return false

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return false

  return equals(signature, await sign(`${cookieLinkId}.${expiresAtRaw}`))
}

/** Opções do `Set-Cookie`. `httpOnly` porque nenhum script da página precisa
 * ler isto, e `lax` porque a navegação que importa é o clique no link vindo do
 * WhatsApp. */
export const PORTAL_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
} as const
