import { APICallError, RetryError, StreamProviderError } from 'ai'

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
 * A cota do PROVEDOR acabou (429). No plano gratuito do Gemini são 20
 * requisições por dia por modelo, somando a equipe e o portal — dizer isso
 * evita que alguém insista num pedido que não vai passar hoje.
 */
export function isProviderQuotaError(error: unknown): boolean {
  return providerStatus(error) === 429
}

/**
 * Os CRÉDITOS do provedor acabaram (402). No Gemini pré-pago é "prepayment
 * credits are depleted" — visto em 2026-10-14. Não passa amanhã, como a cota:
 * alguém precisa pôr saldo na conta.
 */
export function isProviderCreditError(error: unknown): boolean {
  return providerStatus(error) === 402
}
