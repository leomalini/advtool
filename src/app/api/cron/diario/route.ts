import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { enqueueUntriagedPublications } from '@/features/ia/batch/arrival'
import { collectBatches } from '@/features/ia/batch/collect'
import { sendDailyBriefings } from '@/features/ia/briefing/dailyBriefing'
import { runBillingRoutine, type BillingRoutineSummary } from '@/lib/billing/routine'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/** Segundos: recolher os lotes e um briefing por pessoa. */
export const maxDuration = 300

/** A Vercel manda `Authorization: Bearer <CRON_SECRET>` quando a variável existe. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * GET /api/cron/diario — o cron da Vercel, às 7h de Brasília (`vercel.json`;
 * no plano Hobby o horário varia dentro da hora). Fase 5:
 *
 * 1. recolhe os lotes prontos (triagem, resumo, portal);
 * 2. manda para a triagem as publicações dos últimos dias que ficaram sem;
 * 3. manda o briefing do dia de cada pessoa, como aviso no sino;
 * 4. a régua de cobrança: fila do dia, clique sem pagamento e régua
 *    encerrada, como avisos no sino (docs/cobrancas.md, fase 2).
 *
 * Sem `CRON_SECRET` configurado a rota recusa tudo: ninguém de fora dispara
 * gasto com IA.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // A régua roda primeiro e por conta própria: não depende da IA, e uma falha
  // dela não impede os lotes nem o briefing.
  let billing: BillingRoutineSummary | { error: string } = {
    error: 'SUPABASE_SERVICE_ROLE_KEY ausente',
  }
  if (hasServiceRoleKey()) {
    try {
      billing = await runBillingRoutine(createAdminClient())
    } catch (error) {
      console.error('[cron] régua de cobrança falhou:', error)
      billing = { error: 'falhou' }
    }
  }

  const collected = await collectBatches()
  await enqueueUntriagedPublications({ sinceDays: 7, limit: 50 })
  const briefings = await sendDailyBriefings()

  return NextResponse.json({ collected, briefings, billing })
}
