import { APICallError, RetryError, StreamProviderError } from 'ai'

/**
 * A cota do PROVEDOR acabou (429). No plano gratuito do Gemini são 20
 * requisições por dia por modelo, somando a equipe e o portal — dizer isso
 * evita que alguém insista num pedido que não vai passar hoje.
 */
export function isProviderQuotaError(error: unknown): boolean {
  // Recusa na chamada chega como APICallError (embrulhado em RetryError depois
  // das novas tentativas); recusa no meio do stream, como StreamProviderError.
  const cause = RetryError.isInstance(error) ? error.lastError : error
  return (
    (APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)) &&
    cause.statusCode === 429
  )
}
