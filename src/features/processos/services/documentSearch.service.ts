import type { DocumentSearchResponse } from '@/lib/buscaprocessos/documentSearch'

export const DOCUMENT_SEARCH_PENDING_MESSAGE =
  'Consulta em processamento na BuscaProcessos. Tente novamente em alguns segundos.'

/** Quantas releituras do requestId antes de desistir — mesmo limite finito do
 * `cnjLookup`, pela mesma razão: um poll aberto seguraria a tela para sempre
 * se a consulta travasse do lado da API. */
const POLL_ATTEMPTS = 4

export type DocumentSearchOutcome =
  | { status: 'ok'; data: DocumentSearchResponse }
  | { status: 'pending'; message: string }

export interface DocumentSearchArgs {
  /** CPF ou CNPJ; a rota normaliza, então pode vir formatado. */
  document: string
  /** De qual ficha de cliente a busca partiu — vira auditoria na linha. */
  clientId?: string | null
  /** Ignora o cache e paga uma consulta nova. */
  force?: boolean
  signal?: AbortSignal
}

/**
 * Busca os processos de um CPF/CNPJ.
 *
 * Erro vira exceção, e não um ramo do retorno: diferente da consulta por CNJ
 * — onde "não encontrei" é resposta legítima e a tela segue com o formulário
 * vazio — aqui uma falha precisa aparecer, porque o usuário acabou de pedir
 * uma consulta externa e merece saber se ela aconteceu.
 */
export async function searchProcessosByDocumento({
  document,
  clientId,
  force,
  signal,
}: DocumentSearchArgs): Promise<DocumentSearchOutcome> {
  const params = new URLSearchParams({ cpf_cnpj: document })
  if (clientId) params.set('client_id', clientId)
  if (force) params.set('force', '1')

  const res = await fetch(`/api/buscaprocessos/processos?${params}`, { signal })
  const json = await res.json()

  if (res.status === 202) return pollRequest(json.requestId, json.retryAfterMs, signal)
  if (!res.ok) throw new Error(json.error ?? 'Não foi possível consultar o documento.')

  return { status: 'ok', data: json as DocumentSearchResponse }
}

/** Relê o resultado assíncrono respeitando o intervalo pedido pela API.
 *
 * O `kind=documento` é obrigatório: sem ele a rota de releitura mapeia o
 * resultado como capa de processo e devolve um objeto vazio sem reclamar. */
async function pollRequest(
  requestId: string,
  retryAfterMs: number,
  signal?: AbortSignal,
): Promise<DocumentSearchOutcome> {
  let waitMs = retryAfterMs || 5_000

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    if (signal?.aborted) return { status: 'pending', message: DOCUMENT_SEARCH_PENDING_MESSAGE }

    const res = await fetch(
      `/api/buscaprocessos/requests/${encodeURIComponent(requestId)}?kind=documento`,
      { signal },
    )
    const json = await res.json()

    if (res.status === 202) {
      waitMs = json.retryAfterMs || waitMs
      continue
    }
    if (!res.ok) throw new Error(json.error ?? 'Falha ao reler a consulta.')

    return { status: 'ok', data: json as DocumentSearchResponse }
  }

  return { status: 'pending', message: DOCUMENT_SEARCH_PENDING_MESSAGE }
}
