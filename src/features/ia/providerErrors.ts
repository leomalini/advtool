import {
  APICallError,
  RetryError,
  StreamProviderError,
  type StreamTextTransform,
  type ToolSet,
} from 'ai'
import { AI_ERROR_MESSAGES, type AiErrorMessage } from './errorMessages'

/**
 * O código HTTP da recusa do provedor. Recusa na chamada chega como
 * APICallError (embrulhado em RetryError depois das novas tentativas); recusa
 * no meio do stream, como StreamProviderError.
 */
function providerStatus(error: unknown): number | undefined {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  return APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)
    ? cause.statusCode
    : undefined
}

/**
 * Os filtros de segurança do provedor recusaram o turno. Não é erro HTTP: a
 * Anthropic responde 200 com `stop_reason: refusal`, e o AI SDK entrega isso
 * como `finishReason: 'content-filter'`, sem texto. Com `fallbacks: 'default'`
 * a própria API tenta outro modelo antes; chega aqui o que nem ele respondeu.
 */
export class ProviderRefusalError extends Error {
  constructor() {
    super('O provedor recusou o turno (content-filter).')
    this.name = 'ProviderRefusalError'
  }
}

/**
 * Transforma a recusa num erro do turno. Sem isto, o turno termina sem texto:
 * a tela tira o "pensando…" e não mostra nada, como se a pergunta tivesse
 * sumido.
 */
export function refusalAsError<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () =>
    new TransformStream({
      transform(part, controller) {
        if (part.type === 'finish-step' && part.finishReason === 'content-filter') {
          controller.enqueue({ type: 'error', error: new ProviderRefusalError() })
        }
        controller.enqueue(part)
      },
    })
}

export type ProviderErrorKind =
  | 'auth'
  | 'credits'
  | 'rate_limit'
  | 'overloaded'
  | 'refusal'
  | 'other'

/**
 * Que tipo de falha foi, pelo código HTTP do provedor:
 * - 401/403: a chave não foi aceita (ou não tem acesso ao modelo);
 * - 402: créditos esgotados — no Gemini pré-pago, "prepayment credits are
 *   depleted" (visto em 2026-10-14). Não passa sozinho: alguém põe saldo;
 * - 429: limite de pedidos. Na Anthropic é por minuto; no plano gratuito do
 *   Gemini era a cota do DIA (20 por modelo);
 * - 503/529: provedor sobrecarregado ("overloaded", "high demand").
 */
export function providerErrorKind(error: unknown): ProviderErrorKind {
  if (error instanceof ProviderRefusalError) return 'refusal'
  const status = providerStatus(error)
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'credits'
  if (status === 429) return 'rate_limit'
  if (status === 503 || status === 529) return 'overloaded'
  return 'other'
}

const MESSAGE_BY_KIND: Record<ProviderErrorKind, AiErrorMessage> = {
  auth: AI_ERROR_MESSAGES.auth,
  credits: AI_ERROR_MESSAGES.credits,
  rate_limit: AI_ERROR_MESSAGES.rateLimit,
  overloaded: AI_ERROR_MESSAGES.overloaded,
  refusal: AI_ERROR_MESSAGES.refusal,
  other: AI_ERROR_MESSAGES.generic,
}

/** A mensagem para a equipe. O detalhe técnico fica no log de quem chamou. */
export function providerErrorMessage(error: unknown): AiErrorMessage {
  return MESSAGE_BY_KIND[providerErrorKind(error)]
}

/** A cota ou o limite de pedidos do provedor (429). */
export function isProviderQuotaError(error: unknown): boolean {
  return providerErrorKind(error) === 'rate_limit'
}

/** Os créditos do provedor acabaram (402). */
export function isProviderCreditError(error: unknown): boolean {
  return providerErrorKind(error) === 'credits'
}
