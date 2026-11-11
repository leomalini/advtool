// Server-side only — usa a API key da BuscaProcessos.
import { BpPendingError, getRequestResult } from './client'
import type { BpResponse } from './types'

const DEFAULT_POLL_MS = 5_000

export interface AwaitPendingOptions {
  /** Quanto esperar, no total, antes de desistir e devolver o 202 a quem chamou. */
  maxWaitMs?: number
}

/**
 * Faz a chamada e, se ela sair por 202, espera o resultado em
 * `GET /v1/requests/{requestId}`.
 *
 * Para quem não tem tela: a rota de consulta por CNJ devolve o 202 para o
 * navegador repetir a espera, mas um script em lote precisa do dado na mão. A
 * releitura não cobra de novo — a consulta já aconteceu na chamada original.
 *
 * Passado `maxWaitMs`, relança o `BpPendingError` com o mesmo `requestId`:
 * quem chamou decide se tenta depois.
 */
export async function awaitPending<T>(
  call: () => Promise<BpResponse<T>>,
  { maxWaitMs = 120_000 }: AwaitPendingOptions = {},
): Promise<BpResponse<T>> {
  try {
    return await call()
  } catch (err) {
    if (!(err instanceof BpPendingError) || !err.requestId) throw err

    const requestId = err.requestId
    const deadline = Date.now() + maxWaitMs
    let waitMs = err.pollAfterMs || DEFAULT_POLL_MS

    while (Date.now() + waitMs <= deadline) {
      await sleep(waitMs)
      try {
        return await getRequestResult<T>(requestId)
      } catch (retryErr) {
        if (!(retryErr instanceof BpPendingError)) throw retryErr
        waitMs = retryErr.pollAfterMs || DEFAULT_POLL_MS
      }
    }

    throw new BpPendingError(
      requestId,
      waitMs,
      `Consulta ainda em processamento na BuscaProcessos depois de ${Math.round(maxWaitMs / 1000)} s.`,
    )
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
