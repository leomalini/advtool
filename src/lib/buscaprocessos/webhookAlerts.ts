// Server-side. O client é o `service_role` da rota do webhook: quem escreve em
// `notifications` é sempre o servidor (migration 47).
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Aviso de que o webhook está recusando entregas.
 *
 * O endpoint responde 401 e registra — e mais nada. Entre 10 e 23 de setembro
 * de 2026 toda entrega da BuscaProcessos voltou 401 porque faltava um caractere
 * no token da Vercel, e só se descobriu quando alguém foi olhar o log. A
 * intimação que não entra sozinha não avisa que não entrou: quem precisa saber
 * é o administrador, e o lugar dele saber é o sino.
 *
 * Três recusas SEGUIDAS, e não uma: um POST avulso sem credencial é o que
 * qualquer um que descubra a URL consegue mandar, e alertar a cada um deles
 * ensinaria a ignorar o alerta. Três entregas da origem recusadas em sequência
 * já não são ruído.
 */

const STREAK = 3
const ALERT_KIND = 'webhook_erro'

/** Aba de Configurações onde a credencial é conferida e as recusas reprocessadas. */
export const WEBHOOKS_SETTINGS_PATH = '/configuracoes?aba=webhooks'

export async function alertOnRejectionStreak(supabase: SupabaseClient): Promise<void> {
  // Só o que a ORIGEM entregou: testes e reprocessamentos não dizem nada sobre
  // a credencial que a BuscaProcessos está usando.
  const { data: recent, error } = await supabase
    .from('webhook_events')
    .select('status')
    .eq('is_test', false)
    .is('replay_of', null)
    .order('received_at', { ascending: false })
    .limit(STREAK)

  if (error) {
    // Base sem a migration 65: sem `replay_of` não há como separar entrega de
    // reprocessamento, e um alerta errado é pior que nenhum.
    console.error('[buscaprocessos/webhook] alerta não avaliado:', error.message)
    return
  }

  const streak = (recent ?? []) as { status: string }[]
  if (streak.length < STREAK || streak.some((row) => row.status !== 'invalid')) return

  // Um aviso aberto por vez. Enquanto ninguém o leu, ele continua verdadeiro —
  // repetir a cada nova recusa só enterraria os outros avisos do sino.
  const { data: open } = await supabase
    .from('notifications')
    .select('id')
    .eq('kind', ALERT_KIND)
    .is('read_at', null)
    .limit(1)

  if (open && open.length > 0) return

  const { error: insertError } = await supabase.from('notifications').insert({
    kind: ALERT_KIND,
    resource: 'configuracoes',
    title: 'Webhook recusando entregas',
    body:
      `As últimas ${STREAK} entregas da BuscaProcessos foram recusadas: nenhuma intimação ` +
      'está entrando sozinha. Confira a credencial e reprocesse as recusadas em Configurações → Webhooks.',
    link: WEBHOOKS_SETTINGS_PATH,
    source: 'webhook',
  })

  if (insertError) {
    console.error('[buscaprocessos/webhook] alerta não gravado:', insertError.message)
  }
}

export interface OriginDelivery {
  receivedAt: string
  status: string
  event: string | null
  /** O motivo da recusa, com o que chegou e o que está configurado. */
  error: string | null
}

/**
 * A última entrega da origem — é ela que diz, agora, se a credencial vale.
 *
 * Numa base sem a migration 65 não dá para excluir os reprocessamentos, e a
 * consulta cai para a última entrega real de qualquer tipo: imprecisa, mas
 * melhor que tela nenhuma.
 */
export async function readLastOriginDelivery(
  supabase: SupabaseClient,
): Promise<OriginDelivery | null> {
  const columns = 'received_at, status, event, error'

  let { data, error } = await supabase
    .from('webhook_events')
    .select(columns)
    .eq('is_test', false)
    .is('replay_of', null)
    .order('received_at', { ascending: false })
    .limit(1)

  if (error?.code === '42703') {
    ;({ data, error } = await supabase
      .from('webhook_events')
      .select(columns)
      .eq('is_test', false)
      .order('received_at', { ascending: false })
      .limit(1))
  }

  if (error) {
    console.error('[buscaprocessos/webhook] última entrega não lida:', error.message)
    return null
  }

  const row = (data?.[0] ?? null) as {
    received_at: string
    status: string
    event: string | null
    error: string | null
  } | null

  return row
    ? { receivedAt: row.received_at, status: row.status, event: row.event, error: row.error }
    : null
}
