import type { CnjLookupResult } from '@/types/legalProcess.types'

export const CNJ_PENDING_MESSAGE =
  'Consulta em processamento na BuscaProcessos. Tente novamente em alguns segundos.'

/** Quantas releituras do requestId antes de desistir. Finito de propósito: um
 * poll aberto seguraria a tela indefinidamente se a consulta travasse do lado
 * da API. */
const POLL_ATTEMPTS = 4

export type CnjLookupOutcome =
  | { status: 'ok'; data: CnjLookupResult }
  | { status: 'pending'; message: string }
  | { status: 'error'; message: string }

/**
 * Consulta o CNJ na BuscaProcessos, resolvendo o caso assíncrono.
 *
 * A API responde 202 quando a consulta ultrapassa a janela síncrona: o
 * resultado sai depois, em `/api/buscaprocessos/requests/{requestId}`. Sem
 * tratar isso, um 202 caía no ramo de erro e a tela dizia "processo não
 * encontrado" para uma consulta que ainda ia responder.
 *
 * Compartilhado entre o formulário de processo e o campo de vínculo do CRM —
 * as duas telas fazem a mesma consulta e precisam da mesma espera.
 */
export async function lookupCnjViaApi(
  cnj: string,
  signal: AbortSignal,
): Promise<CnjLookupOutcome> {
  const res = await fetch(`/api/buscaprocessos/processos/${encodeURIComponent(cnj)}`, { signal })
  const json = await res.json()

  if (res.status === 202) return pollRequest(json.requestId, json.retryAfterMs, signal)
  if (!res.ok) return { status: 'error', message: json.error ?? 'Processo não encontrado.' }

  return { status: 'ok', data: json as CnjLookupResult }
}

/** Relê o resultado respeitando o intervalo pedido pela própria API. */
async function pollRequest(
  requestId: string,
  retryAfterMs: number,
  signal: AbortSignal,
): Promise<CnjLookupOutcome> {
  let waitMs = retryAfterMs || 5_000

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    if (signal.aborted) return { status: 'pending', message: CNJ_PENDING_MESSAGE }

    const res = await fetch(`/api/buscaprocessos/requests/${encodeURIComponent(requestId)}`, {
      signal,
    })
    const json = await res.json()

    if (res.status === 202) {
      waitMs = json.retryAfterMs || waitMs
      continue
    }
    if (!res.ok) return { status: 'error', message: json.error ?? 'Falha ao reler a consulta.' }

    return { status: 'ok', data: json as CnjLookupResult }
  }

  return { status: 'pending', message: CNJ_PENDING_MESSAGE }
}
