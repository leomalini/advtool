'use client'

import type { LegalArea } from '@/types/cliente.types'
import type { DigestBulkSummary, DigestSubscription } from '@/types/emailMessage.types'

/**
 * O resumo diário visto pelo escritório. Tudo pela rota: ligar confere o link
 * do portal (sem leitura por RLS) e o bloqueio do endereço, no servidor.
 */

/** A recusa da rota; ao ligar, traz a situação atual para a tela mostrar o
 * que falta. */
export class DigestRequestError extends Error {
  constructor(
    message: string,
    readonly subscription: DigestSubscription | null,
  ) {
    super(message)
    this.name = 'DigestRequestError'
  }
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: unknown; subscription?: DigestSubscription })
    | null
  if (!response.ok) {
    throw new DigestRequestError(
      typeof body?.error === 'string' ? body.error : fallback,
      body?.subscription ?? null,
    )
  }
  if (!body) throw new DigestRequestError(fallback, null)
  return body
}

export async function getDigestSubscription(clientId: string): Promise<DigestSubscription> {
  const response = await fetch(`/api/clientes/${clientId}/resumo-email`)
  const body = await readJson<{ subscription: DigestSubscription }>(
    response,
    'Não foi possível carregar o resumo por e-mail.',
  )
  return body.subscription
}

export async function setDigestSubscription(
  clientId: string,
  enabled: boolean,
): Promise<DigestSubscription> {
  const response = await fetch(`/api/clientes/${clientId}/resumo-email`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  const body = await readJson<{ subscription: DigestSubscription }>(
    response,
    'Não foi possível alterar o resumo por e-mail.',
  )
  return body.subscription
}

export interface DigestBulkFilter {
  search: string
  legalArea: LegalArea | null
}

/** Prévia (`dryRun`) ou ativação para o recorte da lista de Clientes. */
export async function runDigestBulk(
  filter: DigestBulkFilter,
  dryRun: boolean,
): Promise<DigestBulkSummary> {
  const response = await fetch('/api/clientes/resumo-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...filter, dryRun }),
  })
  const body = await readJson<{ summary: DigestBulkSummary }>(
    response,
    'Não foi possível ativar o resumo para a lista.',
  )
  return body.summary
}
