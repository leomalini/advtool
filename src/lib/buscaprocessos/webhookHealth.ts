// Server-side. O client vem de quem chama: o de SESSÃO na rota do dashboard —
// `webhook_events` é legível com `configuracoes:view` (migration 48).
import type { SupabaseClient } from '@supabase/supabase-js'
import { WEBHOOK_PROVIDERS } from '@/types/webhookEvent.types'
import { readLastOriginDelivery, type OriginDelivery } from './webhookAlerts'
import { countPendingRejections, type PendingCount } from './webhookReplay'

/**
 * A faixa da integração no dashboard (`docs/dashboard.md`, decisão 6).
 *
 * Última entrega e recusas pendentes são as MESMAS funções da aba Webhooks de
 * Configurações — o dashboard não tem uma segunda definição de "pendente" que
 * possa divergir da fila do botão "Reprocessar recusadas".
 */

/** Janela das movimentações sem processo: um mês cobre o ciclo de cobrança do
 * monitoramento, que é mensal. */
export const UNREGISTERED_WINDOW_DAYS = 30

/** Processo monitorado na BuscaProcessos que não está cadastrado aqui. As
 * movimentações dele chegam e não têm onde ficar (`unmatched`). */
export interface UnregisteredMonitoredProcess {
  cnj: string
  /** Entregas `unmatched` na janela. */
  deliveries: number
  lastDeliveryAt: string
}

export interface DashboardWebhookHealth {
  /** Testes e reprocessamentos fora — `null` quando nada chegou ainda. */
  lastDelivery: OriginDelivery | null
  deliveriesLast24h: number
  pendingReplay: PendingCount
  unregistered: UnregisteredMonitoredProcess[]
  /** Vai na resposta para a tela não importar este módulo de servidor só pela
   * constante. */
  unregisteredWindowDays: number
}

export async function readDashboardWebhookHealth(
  supabase: SupabaseClient,
): Promise<DashboardWebhookHealth> {
  const now = Date.now()
  const dayAgo = new Date(now - 24 * 3_600_000).toISOString()

  const [lastDelivery, pendingReplay, deliveriesLast24h, unregistered] = await Promise.all([
    readLastOriginDelivery(supabase),
    countPendingRejections(supabase),
    countOriginDeliveriesSince(supabase, dayAgo),
    readUnregisteredMonitoredProcesses(supabase, now),
  ])

  return {
    lastDelivery,
    deliveriesLast24h,
    pendingReplay,
    unregistered,
    unregisteredWindowDays: UNREGISTERED_WINDOW_DAYS,
  }
}

/** O que a BuscaProcessos mandou — mesmo recorte de `readLastOriginDelivery`. */
async function countOriginDeliveriesSince(supabase: SupabaseClient, since: string): Promise<number> {
  const { count, error } = await supabase
    .from('webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', WEBHOOK_PROVIDERS.buscaProcessos)
    .eq('is_test', false)
    .is('replay_of', null)
    .gte('received_at', since)

  if (error) throw new Error(`Contagem das entregas falhou: ${error.message}`)
  return count ?? 0
}

/** O CNJ das entregas de teste — só zeros (`0000000-00.0000.0.00.0000`), oito
 * delas `unmatched` entre 14 e 25/09/2026. Não é processo de ninguém. */
function isProbeCnj(cnj: string): boolean {
  return /^[0.-]+$/.test(cnj)
}

interface UnmatchedRow {
  received_at: string
  cnj: string | null
  cnj_in_envelope: string | null
}

/**
 * Entregas `unmatched` agrupadas por CNJ, sem os que foram cadastrados depois.
 *
 * O CNJ vem do corpo, nas duas formas que o handler aceita — plana (a real) e
 * com o envelope `data` de uma reentrega manual —, e é comparado com
 * `cnj_number` por igualdade, como `findProcessIdByCnj` faz na hora da
 * entrega: o que não casou lá é exatamente o que aparece aqui.
 */
async function readUnregisteredMonitoredProcesses(
  supabase: SupabaseClient,
  now: number,
): Promise<UnregisteredMonitoredProcess[]> {
  const since = new Date(now - UNREGISTERED_WINDOW_DAYS * 24 * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('webhook_events')
    .select(
      'received_at, cnj:payload->processo->>numero_unico, cnj_in_envelope:payload->data->processo->>numero_unico',
    )
    .eq('provider', WEBHOOK_PROVIDERS.buscaProcessos)
    .eq('is_test', false)
    .eq('status', 'unmatched')
    .gte('received_at', since)

  if (error) throw new Error(`Leitura das entregas sem processo falhou: ${error.message}`)

  const byCnj = new Map<string, UnregisteredMonitoredProcess>()
  for (const row of (data ?? []) as unknown as UnmatchedRow[]) {
    const cnj = (row.cnj ?? row.cnj_in_envelope)?.trim()
    if (!cnj || isProbeCnj(cnj)) continue

    const entry = byCnj.get(cnj)
    if (!entry) {
      byCnj.set(cnj, { cnj, deliveries: 1, lastDeliveryAt: row.received_at })
      continue
    }
    entry.deliveries += 1
    if (row.received_at > entry.lastDeliveryAt) entry.lastDeliveryAt = row.received_at
  }

  if (byCnj.size === 0) return []

  // Cadastrado depois da entrega: o próximo `movimentacao_nova` já casa, e a
  // sincronização do cadastro trouxe o histórico.
  const { data: registered, error: lookupError } = await supabase
    .from('legal_processes')
    .select('cnj_number')
    .in('cnj_number', [...byCnj.keys()])

  if (lookupError) throw new Error(`Consulta dos processos falhou: ${lookupError.message}`)

  for (const row of (registered ?? []) as { cnj_number: string | null }[]) {
    if (row.cnj_number) byCnj.delete(row.cnj_number)
  }

  return [...byCnj.values()].sort((a, b) => b.lastDeliveryAt.localeCompare(a.lastDeliveryAt))
}
