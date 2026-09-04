/**
 * Assinatura HMAC-SHA256 do corpo do webhook.
 *
 * Fica num módulo próprio porque duas partes precisam do mesmo cálculo: o
 * endpoint que confere o que chega e o disparador de teste, que precisa
 * ASSINAR para exercitar a conferência de verdade.
 *
 * O segredo é lido do ambiente do servidor e nunca sai daqui.
 */

const WEBHOOK_SECRET = process.env.BUSCA_PROCESSOS_WEBHOOK_SECRET

export function hasWebhookSecret(): boolean {
  return Boolean(WEBHOOK_SECRET)
}

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Cabeçalho pronto, no formato que o endpoint aceita. Null sem segredo. */
export async function signWebhookBody(body: string): Promise<string | null> {
  if (!WEBHOOK_SECRET) return null
  return `sha256=${await hmacHex(body, WEBHOOK_SECRET)}`
}

export interface SignatureCheck {
  /** false = não há segredo configurado, então não houve o que conferir. */
  configured: boolean
  valid: boolean
}

/**
 * Comparação em tempo constante.
 *
 * Sem segredo configurado, aceita — conveniente em desenvolvimento, inseguro
 * em produção. `configured: false` no retorno é o que permite a tela de
 * Configurações dizer isso em voz alta em vez de deixar passar batido.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null,
): Promise<SignatureCheck> {
  if (!WEBHOOK_SECRET) return { configured: false, valid: true }
  if (!signature) return { configured: true, valid: false }

  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature
  const expected = await hmacHex(body, WEBHOOK_SECRET)

  if (expected.length !== received.length) return { configured: true, valid: false }

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }

  return { configured: true, valid: diff === 0 }
}
