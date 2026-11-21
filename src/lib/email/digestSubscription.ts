// Server-side. Ligar e desligar o resumo — o que as duas rotas da tela (a
// ficha e a ativação em lote) compartilham.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityType } from '@/types/activity.types'
import type { DigestSubscription } from '@/types/emailMessage.types'
import { isEmailConfigured } from './config'
import { assessDigestEligibility, DIGEST_CLIENT_COLUMNS, type DigestClientRow } from './digestEligibility'

export async function loadDigestClient(
  admin: SupabaseClient,
  clientId: string,
): Promise<DigestClientRow | null> {
  const { data, error } = await admin
    .from('clients')
    .select(DIGEST_CLIENT_COLUMNS)
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw new Error(`Cliente não lido: ${error.message}`)
  return (data as unknown as DigestClientRow | null) ?? null
}

/** A situação do resumo de um cliente, como a ficha mostra. */
export async function describeDigestSubscription(
  admin: SupabaseClient,
  client: DigestClientRow,
): Promise<DigestSubscription> {
  const eligibility = await assessDigestEligibility(admin, [client], {
    emailConfigured: isEmailConfigured(),
  })
  const status = eligibility.get(client.id)
  return {
    enabledAt: client.email_updates_enabled_at,
    optedOutAt: client.email_updates_opted_out_at,
    recipient: status?.recipient ?? null,
    blockers: status?.blockers ?? [],
  }
}

function displayName(client: DigestClientRow): string {
  if (client.type === 'company') return client.trade_name ?? client.company_name ?? 'Cliente'
  return client.name ?? 'Cliente'
}

/**
 * Quem ligou ou desligou, no feed de atividades. Best-effort, como todo
 * registro de atividade: perder a linha não desfaz a mudança.
 */
export async function recordDigestActivity(
  admin: SupabaseClient,
  clients: DigestClientRow[],
  actorId: string,
  enabled: boolean,
): Promise<void> {
  if (clients.length === 0) return
  const type: ActivityType = enabled ? 'client_email_digest_enabled' : 'client_email_digest_disabled'
  const { error } = await admin.from('activities').insert(
    clients.map((client) => ({
      type,
      entity_type: 'client',
      entity_id: client.id,
      entity_title: displayName(client),
      actor_id: actorId,
      metadata: {},
    })),
  )
  if (error) console.error('[email/resumo] atividade não registrada:', error.message)
}
