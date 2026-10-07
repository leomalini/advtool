import { bytesToHex, toBase64Url } from '@/lib/clientPortal/token'

/**
 * O token da `webhook_url` de cada link.
 *
 * O webhook da InfinitePay não é assinado: sem isto, qualquer um que
 * descobrisse o endereço conseguiria anunciar um pagamento. Cada cobrança ganha
 * um token próprio, que vai na query da URL registrada no link; o banco guarda
 * só o SHA-256 (`payment_charges.webhook_token_hash`).
 *
 * Não é a única defesa — a baixa só acontece depois do `payment_check` —, mas é
 * a que recusa a entrega forjada antes de qualquer consulta.
 *
 * Mesmo formato do token do portal (`lib/clientPortal/token.ts`): 32 bytes em
 * base64url, sem salt, pelos mesmos motivos.
 */

export interface GeneratedWebhookToken {
  /** Vai na URL do link e não fica guardado em lugar nenhum. */
  token: string
  tokenHash: string
}

/** SHA-256 em hexa — o que `webhook_token_hash` guarda. */
export async function hashWebhookToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToHex(new Uint8Array(digest))
}

export async function generateWebhookToken(): Promise<GeneratedWebhookToken> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  return { token, tokenHash: await hashWebhookToken(token) }
}

/** 43 caracteres base64url, o que 32 bytes produzem. Recusar o resto antes de
 * ir ao banco poupa uma consulta a cada POST de varredura. */
export function looksLikeWebhookToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

/**
 * O token da URL é o desta cobrança? Comparação em tempo constante: o tempo da
 * resposta não pode ir revelando o hash caractere a caractere.
 */
export async function matchesWebhookToken(token: string, expectedHash: string): Promise<boolean> {
  if (!looksLikeWebhookToken(token)) return false

  const actual = await hashWebhookToken(token)
  if (actual.length !== expectedHash.length) return false

  let difference = 0
  for (let index = 0; index < actual.length; index++) {
    difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index)
  }
  return difference === 0
}
