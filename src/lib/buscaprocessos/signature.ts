/**
 * Autenticação do webhook: HMAC-SHA256 do corpo, ou token Bearer.
 *
 * A BuscaProcessos oferece os dois na tela da conta, e qual deles chega
 * depende de como o webhook foi configurado lá. Aceitar só um dos dois
 * devolveria 401 para uma entrega perfeitamente legítima.
 *
 * Fica num módulo próprio porque duas partes precisam do mesmo cálculo: o
 * endpoint que confere o que chega e o disparador de teste, que precisa
 * ASSINAR para exercitar a conferência de verdade.
 *
 * Os segredos são lidos do ambiente do servidor e nunca saem daqui.
 */

const WEBHOOK_SECRET = process.env.BUSCA_PROCESSOS_WEBHOOK_SECRET?.trim()
const WEBHOOK_TOKEN = process.env.BUSCA_PROCESSOS_WEBHOOK_TOKEN?.trim()
/** Não autentica nada: serve só para o diagnóstico reconhecer o valor quando a
 * origem manda a chave da API no lugar do token do webhook. */
const API_KEY = process.env.BUSCA_PROCESSOS_API_KEY?.trim()

/** Prefixo que a BuscaProcessos exibe no token da conta. */
const TOKEN_PREFIX = 'bp_wh_'

/** O token com e sem o prefixo é o mesmo token. */
function stripTokenPrefix(value: string): string {
  return value.startsWith(TOKEN_PREFIX) ? value.slice(TOKEN_PREFIX.length) : value
}

export function hasWebhookSecret(): boolean {
  return Boolean(WEBHOOK_SECRET)
}

export function hasWebhookToken(): boolean {
  return Boolean(WEBHOOK_TOKEN)
}

/**
 * Como a chave secreta vira bytes de chave HMAC.
 *
 * A chave da conta são 64 caracteres hexadecimais — ou seja, 32 bytes escritos
 * em hexa. Há duas leituras possíveis, e as duas existem na prática:
 *
 *   · 'utf8' — a chave é a STRING de 64 caracteres.
 *   · 'hex'  — a chave são os 32 BYTES que aquele hexa representa.
 *
 * São assinaturas diferentes para o mesmo segredo, e nada no cabeçalho diz
 * qual foi usada. Em vez de adivinhar, conferimos as duas: as duas exigem
 * conhecer o segredo, então aceitar ambas não afrouxa nada — só deixa de
 * recusar quem está certo.
 */
export type KeyEncoding = 'utf8' | 'hex'

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null

  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function keyBytes(secret: string, encoding: KeyEncoding): Uint8Array | null {
  if (encoding === 'utf8') return new TextEncoder().encode(secret)
  return hexToBytes(secret)
}

async function hmacHex(
  body: string,
  secret: string,
  encoding: KeyEncoding,
): Promise<string | null> {
  const raw = keyBytes(secret, encoding)
  if (!raw) return null

  const key = await crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
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
export async function signWebhookBody(
  body: string,
  encoding: KeyEncoding = 'utf8',
): Promise<string | null> {
  if (!WEBHOOK_SECRET) return null
  const mac = await hmacHex(body, WEBHOOK_SECRET, encoding)
  return mac ? `sha256=${mac}` : null
}

/** Comparação em tempo constante. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface AuthCheck {
  /** false = nenhum segredo nem token configurado: não houve o que conferir. */
  configured: boolean
  valid: boolean
  /** Como a entrega se autenticou: 'hmac:utf8', 'hmac:hex', 'bearer'. */
  method: string | null
  /** O que veio, para o registro poder explicar um 401 sem adivinhação. */
  receivedSignature: string | null
  /** `Authorization` descrito sem o valor: esquema, tamanho, pontas e com qual
   * dos valores do ambiente ele coincide. */
  receivedAuthorization?: string | null
  /** Falhou? Isto diz contra o que foi comparado. */
  detail?: string
}

/**
 * `Authorization` descrito sem entregar o valor.
 *
 * Um 401 de token só é diagnosticável se der para distinguir "token errado" de
 * "a origem manda a chave da API no lugar do token" e de "os dois valores do
 * ambiente estão trocados". Esquema, tamanho e pontas resolvem o primeiro caso;
 * a comparação com os valores que o ambiente já conhece resolve os outros dois
 * — e nenhuma delas copia segredo nenhum para o log.
 */
function describeAuthorization(header: string): string {
  const parts = /^(\S+)\s+(.+)$/.exec(header.trim())
  const scheme = parts ? parts[1] : '(sem esquema)'
  const value = (parts ? parts[2] : header).trim()

  const known: [string, string | undefined][] = [
    ['WEBHOOK_TOKEN', WEBHOOK_TOKEN],
    ['WEBHOOK_SECRET', WEBHOOK_SECRET],
    ['API_KEY', API_KEY],
  ]
  const match = known.find(
    ([, candidate]) => candidate && equals(stripTokenPrefix(value), stripTokenPrefix(candidate)),
  )

  const ends = value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : '(curto)'
  return [
    `esquema=${scheme}`,
    `tamanho=${value.length}`,
    `valor=${ends}`,
    `coincide_com=${match?.[0] ?? 'nenhum'}`,
  ].join(' ')
}

/**
 * Confere assinatura HMAC e, na falta dela, o token Bearer.
 *
 * Sem nada configurado, aceita — conveniente em desenvolvimento, inseguro em
 * produção. `configured: false` é o que permite a tela de Configurações dizer
 * isso em voz alta em vez de deixar passar batido.
 */
export async function verifyWebhookAuth(
  body: string,
  headers: { signature: string | null; authorization: string | null },
): Promise<AuthCheck> {
  const received = headers.signature?.trim() || null

  if (!WEBHOOK_SECRET && !WEBHOOK_TOKEN) {
    return { configured: false, valid: true, method: null, receivedSignature: received }
  }

  // ── HMAC ──
  if (WEBHOOK_SECRET && received) {
    const hex = received.startsWith('sha256=') ? received.slice(7) : received
    const normalized = hex.trim().toLowerCase()

    for (const encoding of ['utf8', 'hex'] as const) {
      const expected = await hmacHex(body, WEBHOOK_SECRET, encoding)
      if (expected && equals(expected, normalized)) {
        return {
          configured: true,
          valid: true,
          method: `hmac:${encoding}`,
          receivedSignature: received,
        }
      }
    }
  }

  // ── Bearer ──
  //
  // A conta mostra o token com o prefixo `bp_wh_` no cabeçalho e sem ele no
  // campo copiável, então os dois formatos são aceitos — recusar por causa do
  // prefixo seria recusar por causa da tela de onde a pessoa copiou.
  if (WEBHOOK_TOKEN && headers.authorization) {
    // Qualquer esquema, não só `Bearer`: o que autentica é conhecer o token, e
    // recusar `Token …` ou `APIKey …` seria recusar por causa da palavra escrita
    // antes do valor. O valor cru, sem esquema nenhum, também vale.
    const parts = /^(\S+)\s+(.+)$/.exec(headers.authorization.trim())
    const presented = (parts ? parts[2] : headers.authorization).trim()

    if (equals(stripTokenPrefix(presented), stripTokenPrefix(WEBHOOK_TOKEN))) {
      return {
        configured: true,
        valid: true,
        // O esquema entra no método porque é o que revela como a origem manda de
        // fato — é este campo que a tela de Configurações mostra.
        method:
          parts && parts[1].toLowerCase() !== 'bearer'
            ? `bearer:${parts[1].toLowerCase()}`
            : 'bearer',
        receivedSignature: received,
        receivedAuthorization: describeAuthorization(headers.authorization),
      }
    }
  }

  const authorization = headers.authorization ? describeAuthorization(headers.authorization) : null

  const tried = [
    WEBHOOK_SECRET && received ? 'HMAC (chave como texto e como bytes hexa)' : null,
    WEBHOOK_SECRET && !received ? 'HMAC configurado, mas a entrega não trouxe assinatura' : null,
    // O que chegou, e não só "token Bearer": uma recusa que não diz o tamanho
    // nem com qual valor do ambiente o recebido coincide é indistinguível da
    // próxima — e foi isso que deixou o webhook parado sem ninguém saber por quê.
    WEBHOOK_TOKEN && authorization ? `token do webhook [${authorization}]` : null,
    WEBHOOK_TOKEN && !headers.authorization
      ? 'token Bearer configurado, mas a entrega não trouxe Authorization'
      : null,
  ].filter(Boolean)

  return {
    configured: true,
    valid: false,
    method: null,
    receivedSignature: received,
    receivedAuthorization: authorization,
    detail: `Conferido contra: ${tried.join('; ') || 'nada aplicável'}.`,
  }
}
