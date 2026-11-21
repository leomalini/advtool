// Server-side. Quem pode receber o resumo diário — uma regra só para a ficha,
// para a ativação em lote e para o cron. O client é a service_role da rota,
// depois da conferência de permissão: os links do portal não têm leitura por
// RLS, e o token cifrado só abre aqui dentro.
import type { SupabaseClient } from '@supabase/supabase-js'
import { openPortalToken } from '@/lib/clientPortal/vault'
import { chunk } from '@/utils/chunk'
import { pickClientEmail, type ContactSource } from '@/utils/clientContacts'
import type { DigestBlocker } from '@/types/emailMessage.types'
import { normalizeEmailAddress } from './address'

/** As colunas de `clients` que a regra e o envio leem. */
export const DIGEST_CLIENT_COLUMNS =
  'id, type, name, company_name, trade_name, email, phone, is_client, ' +
  'email_updates_enabled_at, email_updates_opted_out_at, ' +
  'contacts:client_contacts(type, value, is_primary)'

export interface DigestClientRow extends ContactSource {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
  is_client: boolean
  email_updates_enabled_at: string | null
  email_updates_opted_out_at: string | null
}

export interface DigestEligibility {
  recipient: string | null
  /** Vazio = pode receber. */
  blockers: DigestBlocker[]
  /** O token do link ativo, aberto — só para montar a URL do e-mail. */
  portalToken: string | null
  /** O final do token, para a cópia guardada mascarar a URL. */
  tokenHint: string | null
}

interface LinkRow {
  client_id: string
  token_sealed: string | null
  token_hint: string
}

/**
 * Confere cada requisito de `docs/emails-clientes.md` ("Quem recebe"), em
 * lote: um cliente ou quinhentos custam as mesmas três consultas por fatia.
 *
 * Os requisitos não incluem `email_updates_enabled_at` nem o pedido de saída
 * do cliente — isso é se ele QUER receber; aqui é se ele PODE. Quem chama
 * decide o que fazer com cada um.
 */
export async function assessDigestEligibility(
  admin: SupabaseClient,
  clients: DigestClientRow[],
  { emailConfigured }: { emailConfigured: boolean },
): Promise<Map<string, DigestEligibility>> {
  const recipients = new Map(clients.map((client) => [client.id, pickClientEmail(client)]))

  const addresses = [
    ...new Set(
      [...recipients.values()].filter((value): value is string => value !== null).map(normalizeEmailAddress),
    ),
  ]

  const suppressed = new Set<string>()
  for (const slice of chunk(addresses)) {
    const { data, error } = await admin.from('email_suppressions').select('address').in('address', slice)
    // Sem conseguir conferir, ninguém passa: mandar para quem marcou spam é o
    // que derruba a reputação do domínio inteiro.
    if (error) throw new Error(`Bloqueios não conferidos: ${error.message}`)
    for (const row of (data ?? []) as { address: string }[]) suppressed.add(row.address)
  }

  const links = new Map<string, LinkRow>()
  for (const slice of chunk(clients.map((client) => client.id))) {
    const { data, error } = await admin
      .from('client_portal_links')
      .select('client_id, token_sealed, token_hint')
      .in('client_id', slice)
      .is('revoked_at', null)
    if (error) throw new Error(`Links do portal não lidos: ${error.message}`)
    for (const row of (data ?? []) as LinkRow[]) links.set(row.client_id, row)
  }

  const result = new Map<string, DigestEligibility>()
  for (const client of clients) {
    const recipient = recipients.get(client.id) ?? null
    const link = links.get(client.id) ?? null
    const portalToken = link ? await openPortalToken(link.token_sealed) : null

    const blockers: DigestBlocker[] = []
    if (!emailConfigured) blockers.push('email_not_configured')
    if (!client.is_client) blockers.push('not_client')
    if (!recipient) blockers.push('no_email')
    else if (suppressed.has(normalizeEmailAddress(recipient))) blockers.push('suppressed')
    if (!link) blockers.push('no_portal_link')
    else if (!portalToken) blockers.push('portal_link_unrecoverable')

    result.set(client.id, {
      recipient,
      blockers,
      portalToken,
      tokenHint: link?.token_hint ?? null,
    })
  }

  return result
}
