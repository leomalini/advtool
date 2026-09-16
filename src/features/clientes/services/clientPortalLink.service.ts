'use client'

import type { ClientPortalLink, IssuedClientPortalLink } from '@/types/clientPortal.types'

/**
 * O link de acompanhamento visto pelo escritório.
 *
 * Passa por `/api/clientes/<id>/portal-link` em vez de falar com o Supabase
 * direto, ao contrário dos demais services de `clientes`: emitir um link exige
 * gerar o token, gravar só o hash e revogar o anterior na mesma operação —
 * nada disso pode acontecer no browser, onde o token em claro já teria
 * passeado pelo bundle antes de virar hash.
 */

async function parseError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => null)
  throw new Error(typeof body?.error === 'string' ? body.error : fallback)
}

/** O link ativo, ou null se o cliente ainda não tem nenhum. */
export async function getClientPortalLink(clientId: string): Promise<ClientPortalLink | null> {
  const response = await fetch(`/api/clientes/${clientId}/portal-link`)
  if (!response.ok) await parseError(response, 'Erro ao carregar o link de acompanhamento.')

  const body = (await response.json()) as { link: ClientPortalLink | null }
  return body.link
}

/**
 * Emite um link novo e revoga o anterior.
 *
 * A URL completa só existe neste retorno — o banco guarda o hash. Quem chama
 * precisa mostrá-la na hora; não há como buscá-la depois.
 */
export async function issueClientPortalLink(clientId: string): Promise<IssuedClientPortalLink> {
  const response = await fetch(`/api/clientes/${clientId}/portal-link`, { method: 'POST' })
  if (!response.ok) await parseError(response, 'Erro ao gerar o link de acompanhamento.')

  const body = (await response.json()) as { link: IssuedClientPortalLink }
  return body.link
}

export async function revokeClientPortalLink(clientId: string): Promise<void> {
  const response = await fetch(`/api/clientes/${clientId}/portal-link`, { method: 'DELETE' })
  if (!response.ok) await parseError(response, 'Erro ao revogar o link de acompanhamento.')
}
