import { createClient } from '@/lib/supabase/client'
import type { WebhookEvent, WebhookEventFilters } from '@/types/webhookEvent.types'

const supabase = createClient()

/**
 * Histórico de entregas do webhook.
 *
 * Lido direto do banco, e não por uma rota: a RLS já limita a `configuracoes:view`
 * (migration 48), e uma rota intermediária só repetiria essa regra em outro
 * lugar. A escrita é que passa por rota, porque quem escreve é `service_role`.
 */

// Todas as colunas, e não uma lista: `replayed_at`/`replay_of` chegam com a
// migration 65, e nomeá-las aqui quebraria a lista inteira numa base onde ela
// ainda não foi aplicada. A lista já lia todas as outras — inclusive o corpo.
const WEBHOOK_EVENT_COLUMNS = '*'

export async function getWebhookEvents(
  filters: WebhookEventFilters = {},
): Promise<WebhookEvent[]> {
  let query = supabase
    .from('webhook_events')
    .select(WEBHOOK_EVENT_COLUMNS)
    .order('received_at', { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.isTest !== undefined) query = query.eq('is_test', filters.isTest)

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as unknown as WebhookEvent[]
}
