// Server-side. O webhook da D4Sign: o corpo, a conferência do HMAC e o que fica
// gravado para diagnóstico.
import { bytesToHex } from '@/lib/clientPortal/token'
import { D4SIGN_WEBHOOK_EVENTS, type D4SignWebhookEvent } from '@/types/d4sign.types'

/** Um aviso lido: o documento e o evento. O resto do corpo fica em
 * `webhook_events.payload` — o formato da versão 2.0 ainda não foi visto. */
export interface D4SignDelivery {
  /** UUID do documento na D4Sign — o que o HMAC assina. */
  uuid: string
  typePost: string
  /** Null quando o `type_post` não é um dos quatro documentados. */
  event: D4SignWebhookEvent | null
}

/** Chave repetida vira lista, em vez de a última apagar as outras. */
function entriesToRecord(entries: Iterable<[string, string]>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    const current = record[key]
    if (current === undefined) record[key] = value
    else record[key] = Array.isArray(current) ? [...current, value] : [current, value]
  }
  return record
}

function formRecord(form: FormData): Record<string, unknown> {
  const entries: [string, string][] = []
  form.forEach((value, key) => {
    entries.push([key, typeof value === 'string' ? value : `[arquivo ${value.name}]`])
  })
  return entriesToRecord(entries)
}

/**
 * O corpo como objeto. A documentação diz "FORM-DATA" sem dizer qual —
 * multipart ou urlencoded — e os exemplos da versão 2.0 parecem JSON. As três
 * leituras ficam aqui até o spike mostrar o que chega.
 */
export async function parseD4SignBody(
  raw: string,
  contentType: string | null,
): Promise<Record<string, unknown> | null> {
  if (!raw.trim()) return null
  const type = contentType?.toLowerCase() ?? ''

  if (type.includes('multipart/form-data')) {
    try {
      const form = await new Response(raw, { headers: { 'content-type': contentType ?? '' } })
        .formData()
      return formRecord(form)
    } catch {
      return null
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    return entriesToRecord(new URLSearchParams(raw))
  }

  try {
    const json: unknown = JSON.parse(raw)
    return typeof json === 'object' && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null
  } catch {
    // Sem Content-Type útil, um corpo `uuid=…&type_post=…` ainda é formulário.
    return /^[^=&\s]+=/.test(raw) ? entriesToRecord(new URLSearchParams(raw)) : null
  }
}

function text(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  return value.trim() || null
}

export function toD4SignDelivery(fields: Record<string, unknown>): D4SignDelivery | null {
  const uuid = text(fields.uuid)
  const typePost = text(fields.type_post)
  if (!uuid || !typePost) return null

  const events: Record<string, D4SignWebhookEvent> = D4SIGN_WEBHOOK_EVENTS
  return { uuid, typePost, event: events[typePost] ?? null }
}

/** A "Secret Key MAC" entra como texto, mesmo sendo 64 caracteres de hexa —
 * conferido com um aviso real no spike (2026-10-22). */
async function hmacHex(message: string, secret: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return bytesToHex(new Uint8Array(mac))
}

/** Comparação em tempo constante. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return difference === 0
}

/**
 * O cabeçalho com a assinatura. A documentação diz `Content-Hmac:
 * sha256=<hex>`; o aviso real do spike (2026-10-22) veio em `x-signature`, só o
 * hexa. Lê os dois, nessa ordem.
 */
export function d4signSignatureHeader(headers: Headers): string | null {
  return headers.get('x-signature') ?? headers.get('content-hmac')
}

/**
 * Confere a assinatura — o HMAC-SHA256 do UUID do documento com a Secret Key
 * MAC da conta, em hexa, com ou sem o prefixo `sha256=`.
 *
 * Só o UUID é assinado, não o corpo: a conferência prova que quem mandou
 * conhece a chave e falava deste documento, não que o evento é verdadeiro. Por
 * isso nada muda de status pelo corpo — a fase 2 confirma na API antes.
 */
export async function verifyD4SignHmac(
  uuid: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  const received = header?.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!received || !/^[0-9a-f]{64}$/.test(received)) return false
  return equals(await hmacHex(uuid, secret), received)
}

/**
 * O que ajuda a diagnosticar, e nada que sirva de credencial.
 *
 * A assinatura não é segredo — é o UUID assinado — e guardá-la permite
 * conferir de novo uma entrega recusada depois de corrigir a variável. O IP
 * fica registrado sem bloquear: a central de ajuda cita 54.94.40.55, mas o
 * aviso do spike veio de 18.229.93.53 (`Webhook-Worker/1.0`) — a D4Sign troca
 * sem aviso.
 */
export function d4signDiagnosticHeaders(headers: Headers): Record<string, string | null> {
  return {
    content_type: headers.get('content-type'),
    user_agent: headers.get('user-agent'),
    forwarded_for: headers.get('x-forwarded-for'),
    signature: d4signSignatureHeader(headers),
    header_names: [...headers.keys()].sort().join(', '),
  }
}
