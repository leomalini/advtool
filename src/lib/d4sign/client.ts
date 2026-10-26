// Server-side only — as chaves da D4Sign vão na query string de cada chamada.
import { getD4SignConfig, type D4SignConfig } from './config'

/** A documentação não fala em tempo de resposta. 30 s cobre uma lentidão real
 * e ainda cabe no `maxDuration = 60` das rotas. O upload (fase 2) terá o seu. */
const TIMEOUT_MS = 30_000

export type D4SignErrorKind =
  | 'not_configured'
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'rejected'
  | 'unavailable'
  | 'invalid_response'

export class D4SignApiError extends Error {
  constructor(
    readonly kind: D4SignErrorKind,
    /** HTTP da D4Sign; 502/504 quando a falha foi de rede ou de leitura. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'D4SignApiError'
  }
}

/** "Esta chave da API já atingiu o tempo limite para este método" — a central
 * de ajuda não diz o status HTTP, então a mensagem é a pista. */
const RATE_LIMIT_PATTERN = /atingiu o tempo limite/i
/** "This account has no more limits to send documents" — a cota do plano. */
const QUOTA_PATTERN = /no more limits to send/i

const KIND_MESSAGES: Record<D4SignErrorKind, string> = {
  not_configured: 'A D4Sign não está configurada no servidor (variáveis D4SIGN_*).',
  auth:
    'A D4Sign recusou as chaves da API. Confira D4SIGN_TOKEN_API e D4SIGN_CRYPT_KEY — e se são ' +
    'do mesmo ambiente (sandbox ou produção).',
  rate_limit:
    'A D4Sign aceita 10 chamadas por hora para esta operação neste plano. Tente de novo mais tarde.',
  quota: 'Os envios do plano da D4Sign acabaram.',
  rejected: 'A D4Sign recusou o pedido.',
  unavailable: 'A D4Sign não respondeu como esperado.',
  invalid_response: 'A resposta da D4Sign veio num formato inesperado.',
}

/** Os tipos de erro que a resposta da D4Sign explica melhor que a nossa frase. */
const KINDS_WITH_DETAIL = new Set<D4SignErrorKind>(['rejected', 'unavailable', 'invalid_response'])

/**
 * Tira as chaves de qualquer texto que vá para log, banco ou tela. A D4Sign
 * não deveria ecoá-las, mas uma URL com a query inteira num erro de rede, por
 * exemplo, as levaria junto.
 */
export function redactD4SignSecrets(
  text: string,
  config: D4SignConfig | null = getD4SignConfig(),
): string {
  let result = text
  for (const secret of [config?.tokenApi, config?.cryptKey]) {
    if (secret) result = result.split(secret).join('***')
  }
  return result.replace(/(tokenAPI|cryptKey)=[^&\s"']+/gi, '$1=***')
}

/** A mensagem do corpo: `mensagem_pt` quando vem em português, senão `message`. */
function bodyMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null
  if (typeof body !== 'object' || body === null) return null

  const record = body as Record<string, unknown>
  for (const key of ['mensagem_pt', 'message', 'error']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function classify(status: number, detail: string | null): D4SignErrorKind {
  if (detail && RATE_LIMIT_PATTERN.test(detail)) return 'rate_limit'
  if (detail && QUOTA_PATTERN.test(detail)) return 'quota'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 500) return 'unavailable'
  return 'rejected'
}

/** O erro com a frase para a tela e, quando ajuda, o que a D4Sign disse. */
export function d4signError(
  kind: D4SignErrorKind,
  status: number,
  path: string,
  detail: string | null,
): D4SignApiError {
  const extra = detail && KINDS_WITH_DETAIL.has(kind) ? ` (${path}: ${detail.slice(0, 300)})` : ''
  return new D4SignApiError(kind, status, redactD4SignSecrets(`${KIND_MESSAGES[kind]}${extra}`))
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  /** Corpo JSON. Sem ele (e sem `form`), a chamada é GET. */
  json?: Record<string, unknown>
  /** Corpo multipart — o upload de arquivo. */
  form?: FormData
  /** Para a chamada que demora mais que as consultas, como o upload. */
  timeoutMs?: number
}

/**
 * Uma chamada à API. A resposta é lida como texto antes do parse — um 200 com
 * corpo vazio ou HTML viraria um SyntaxError cru, sem dizer de onde veio.
 * Mesmo cuidado de `lib/infinitepay/client.ts`.
 *
 * Corpo vazio volta como `null`: a documentação não mostra a resposta de
 * várias rotas, e quem chama decide se isso é sucesso.
 */
export async function d4signRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const config = getD4SignConfig()
  if (!config) throw new D4SignApiError('not_configured', 503, KIND_MESSAGES.not_configured)

  const query = new URLSearchParams({ tokenAPI: config.tokenApi })
  if (config.cryptKey) query.set('cryptKey', config.cryptKey)

  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  let response: Response
  try {
    response = await fetch(`${config.apiUrl}${path}?${query.toString()}`, {
      method: options.method ?? (options.json || options.form ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        // Multipart: o fetch põe o Content-Type com o boundary sozinho.
        ...(options.json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.json ? JSON.stringify(options.json) : options.form,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new D4SignApiError(
      'unavailable',
      timedOut ? 504 : 502,
      timedOut
        ? `A D4Sign não respondeu em ${timeoutMs / 1000} s (${path}).`
        : `Falha de rede ao chamar a D4Sign (${path}).`,
    )
  }

  const raw = await response.text()
  let body: unknown = null
  if (raw.trim()) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = raw
    }
  }

  // O limite e a cota podem chegar até num 200: a mensagem é o que conta.
  const detail = bodyMessage(body)
  const limitHit = detail !== null && (RATE_LIMIT_PATTERN.test(detail) || QUOTA_PATTERN.test(detail))
  if (!response.ok || limitHit) {
    throw d4signError(classify(response.status, detail), response.status, path, detail)
  }

  if (typeof body === 'string') {
    throw d4signError('invalid_response', 502, path, body)
  }
  return body
}
