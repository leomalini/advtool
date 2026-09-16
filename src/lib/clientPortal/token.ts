/**
 * O token do link de acompanhamento.
 *
 * O link é a credencial inteira do cliente — não há login, não há senha. Três
 * decisões decorrem disso:
 *
 *   1. **32 bytes de aleatoriedade criptográfica.** 256 bits não se adivinham,
 *      e é o que permite o link ser vitalício sem virar um risco que cresce
 *      com o tempo.
 *   2. **base64url.** O link vai por WhatsApp; `+`, `/` e `=` quebram em
 *      encurtador, em preview de mensagem e ao ser colado à mão.
 *   3. **O banco guarda só o SHA-256.** Um dump não devolve link utilizável.
 *      Não há salt de propósito: o valor de entrada já tem 256 bits de
 *      entropia, então não existe dicionário a construir — e sem salt a busca
 *      no acesso é um índice único, e não uma varredura da tabela.
 *
 * WebCrypto em vez de `node:crypto` pelo mesmo motivo de
 * `lib/buscaprocessos/signature.ts`: é a API que roda igual no runtime Node e
 * no Edge, sem o módulo mudar de comportamento com o alvo do deploy.
 */

/** Só dígitos — é assim que CPF e CNPJ são comparados em todo lugar. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** SHA-256 em hexa. É o que a coluna `token_hash` guarda. */
export async function hashPortalToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

export interface GeneratedPortalToken {
  /** O valor que vai no link. Existe só neste retorno: depois de a rota
   * responder, não há como recuperá-lo — emitir outro é o caminho. */
  token: string
  tokenHash: string
  /** Últimos 6 caracteres, para o escritório reconhecer a linha na tela. */
  tokenHint: string
}

export async function generatePortalToken(): Promise<GeneratedPortalToken> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const token = toBase64Url(bytes)

  return {
    token,
    tokenHash: await hashPortalToken(token),
    tokenHint: token.slice(-6),
  }
}

/**
 * O token tem formato conhecido — 43 caracteres base64url, que é o que 32
 * bytes produzem. Recusar o que não se parece com um token ANTES de ir ao
 * banco evita uma consulta por requisição para qualquer varredura boba de
 * `/acompanhar/wp-admin`.
 */
export function looksLikePortalToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

/** URL completa do link, para copiar na tela do cliente. */
export function buildPortalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/acompanhar/${token}`
}
