import { NextResponse, type NextRequest } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/authorize'
import { requestPublicOrigin } from '@/lib/appUrl'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { runProcessDigest } from '@/lib/email/digest'

/** Segundos: um envio por cliente com novidade, em sequência. */
export const maxDuration = 300

/**
 * GET /api/cron/emails — o resumo diário dos processos, às 18h de Brasília
 * (`vercel.json`, `0 21 * * *` em UTC; no plano Hobby o horário varia dentro
 * da hora).
 *
 * Rota própria, e não um passo a mais em `/api/cron/diario`: horários
 * diferentes, e uma falha no envio de e-mail não pode derrubar a coleta dos
 * lotes de IA, nem o contrário (docs/emails-clientes.md).
 *
 * Rodar duas vezes no mesmo dia não manda dois resumos: a `dedupe_key` é por
 * cliente e por dia de Brasília. A resposta resume o que aconteceu — é o que
 * aparece no log do cron na Vercel.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente.' }, { status: 503 })
  }

  try {
    const digest = await runProcessDigest(createAdminClient(), {
      // A mesma base do link copiado na tela: o cliente recebe o mesmo endereço.
      origin: requestPublicOrigin(request.nextUrl.origin),
    })
    if (digest.errors.length > 0) console.error('[cron/emails] falhas no resumo:', digest.errors)
    return NextResponse.json({ digest })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[cron/emails] resumo não rodou:', detail)
    return NextResponse.json({ error: 'O resumo diário não rodou.' }, { status: 500 })
  }
}
