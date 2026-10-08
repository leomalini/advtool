import { NextResponse } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createClient } from '@/lib/supabase/server'
import { readDashboardWebhookHealth } from '@/lib/buscaprocessos/webhookHealth'

/**
 * Saúde do recebimento da BuscaProcessos, para a faixa da integração no
 * dashboard.
 *
 * Rota, e não consulta direta do navegador, porque "recusada pendente" é
 * definida no servidor (`countPendingRejections`, junto com o reprocessamento)
 * e aquele módulo arrasta o handler inteiro do webhook.
 *
 * Client de SESSÃO, não `service_role`: `webhook_events` já é legível com
 * `configuracoes:view` (migration 48), a mesma permissão conferida aqui. O
 * porteiro só troca a lista vazia da RLS por um 403 que a tela entende.
 */
export async function GET(): Promise<NextResponse> {
  const guard = await requirePermissionApi('configuracoes', 'view')
  if (!guard.ok) return guard.response

  try {
    const supabase = await createClient()
    return NextResponse.json(await readDashboardWebhookHealth(supabase))
  } catch (err) {
    console.error('[webhooks/health] leitura falhou:', err)
    return NextResponse.json(
      { error: 'Não foi possível ler as entregas do webhook.' },
      { status: 500 },
    )
  }
}
