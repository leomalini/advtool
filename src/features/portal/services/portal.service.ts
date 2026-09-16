'use client'

import type {
  PortalChallenge,
  PortalPayload,
  PortalProcessTimeline,
} from '@/types/clientPortal.types'

/**
 * O acesso do cliente ao próprio andamento.
 *
 * Único service do projeto que NÃO fala com o Supabase: a página é anônima, e
 * o token dela não é uma sessão que o PostgREST entenda. Tudo passa por
 * `/api/portal/*`, que valida o link e monta o payload pela service_role.
 *
 * `credentials: 'same-origin'` é o que leva o cookie de sessão do portal junto
 * — sem ele, o GET responderia `needs_document` para sempre.
 */

export class PortalLinkInvalidError extends Error {}

/** Levantado quando falta o cookie: não é erro, é "digite o documento". */
export class PortalNeedsDocumentError extends Error {
  constructor(readonly challenge: PortalChallenge) {
    super('needs_document')
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}

export async function getPortalData(token: string): Promise<PortalPayload> {
  const response = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (response.status === 401) {
    const challenge = (await response.json()) as PortalChallenge
    throw new PortalNeedsDocumentError(challenge)
  }
  if (response.status === 404) {
    throw new PortalLinkInvalidError(
      await errorMessage(response, 'Link de acompanhamento inválido.')
    )
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Não foi possível carregar seus processos.'))
  }

  return (await response.json()) as PortalPayload
}

/**
 * O andamento de um processo — buscado só quando o cliente o abre.
 *
 * Um 404 aqui significa "não é seu, ou não existe". A rota não distingue os
 * dois de propósito, e a tela não tenta adivinhar.
 */
export async function getPortalProcessTimeline(
  token: string,
  processId: string
): Promise<PortalProcessTimeline> {
  const response = await fetch(
    `/api/portal/${encodeURIComponent(token)}/processos/${encodeURIComponent(processId)}`,
    { credentials: 'same-origin', cache: 'no-store' }
  )

  if (response.status === 401) {
    const challenge = (await response.json()) as PortalChallenge
    throw new PortalNeedsDocumentError(challenge)
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Não foi possível carregar o andamento.'))
  }

  return (await response.json()) as PortalProcessTimeline
}

/** Confere o documento e, dando certo, ganha o cookie de sessão do portal. */
export async function verifyPortalDocument(token: string, document: string): Promise<void> {
  const response = await fetch(`/api/portal/${encodeURIComponent(token)}/verificar`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document }),
  })

  if (response.status === 404) {
    throw new PortalLinkInvalidError(
      await errorMessage(response, 'Link de acompanhamento inválido.')
    )
  }
  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Não foi possível verificar o documento.'))
  }
}
