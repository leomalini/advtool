import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { replayRejectedDeliveries } from '@/lib/buscaprocessos/webhookReplay'

/**
 * Reprocessa as entregas recusadas, pela tela de Configurações.
 *
 * Faz o que `scripts/replay-webhooks.mjs` faz pelo terminal, sem depender dele:
 * recuperar intimação presa não pode exigir alguém com o repositório clonado.
 * Uma rodada por chamada (`REPLAY_BATCH_SIZE`); a resposta diz quantas sobraram.
 *
 * Só admin: grava publicações e movimentações com `service_role`.
 */

// Cada entrega reprocessada faz algumas consultas em sequência.
export const maxDuration = 60

export async function POST(): Promise<NextResponse> {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada — nada pode ser gravado.' },
      { status: 503 },
    )
  }

  try {
    const result = await replayRejectedDeliveries(createAdminClient())

    if (!result.available) {
      return NextResponse.json(
        {
          error:
            'A fila de recusas precisa da migration 65 (webhook_events_replay). Aplique com npm run db:push.',
        },
        { status: 409 },
      )
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[webhooks/replay]', err)
    return NextResponse.json(
      { error: 'Não foi possível reprocessar as entregas recusadas.' },
      { status: 500 },
    )
  }
}
