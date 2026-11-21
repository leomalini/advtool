import { NextResponse, type NextRequest } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/authorize'
import { requestPublicOrigin } from '@/lib/appUrl'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { runProcessDigest, type DigestRunResult } from '@/lib/email/digest'
import { runPaymentReminders, type ReminderRunResult } from '@/lib/email/billing'

/** Segundos: um envio por cliente com novidade e por lembrete, em sequência. */
export const maxDuration = 300

type Outcome<T> = { ok: true; result: T } | { ok: false; error: string }

/** Cada tarefa por si: o resumo falhar não impede os lembretes, nem o contrário. */
async function attempt<T>(label: string, task: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, result: await task() }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[cron/emails] ${label} não rodou:`, detail)
    return { ok: false, error: detail }
  }
}

/**
 * GET /api/cron/emails — os e-mails automáticos do dia, às 18h de Brasília
 * (`vercel.json`, `0 21 * * *` em UTC; no plano Hobby o horário varia dentro
 * da hora):
 *
 *   1. o resumo diário dos processos (docs/emails-clientes.md, PR 2);
 *   2. os lembretes de cobrança (PR 3).
 *
 * Rota própria, e não um passo a mais em `/api/cron/diario`: horários
 * diferentes, e uma falha no envio de e-mail não pode derrubar a coleta dos
 * lotes de IA, nem o contrário.
 *
 * Rodar duas vezes no mesmo dia não repete nada: o resumo tem `dedupe_key` por
 * cliente e dia; o lembrete, por cobrança e momento. A resposta resume o que
 * aconteceu — é o que aparece no log do cron na Vercel.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente.' }, { status: 503 })
  }

  const admin = createAdminClient()
  const now = new Date()

  const digest: Outcome<DigestRunResult> = await attempt('resumo diário', () =>
    runProcessDigest(admin, {
      // A mesma base do link copiado na tela: o cliente recebe o mesmo endereço.
      origin: requestPublicOrigin(request.nextUrl.origin),
      now,
    })
  )
  const reminders: Outcome<ReminderRunResult> = await attempt('lembretes de cobrança', () =>
    runPaymentReminders(admin, { now })
  )

  for (const [label, outcome] of [
    ['resumo', digest],
    ['lembretes', reminders],
  ] as const) {
    if (outcome.ok && outcome.result.errors.length > 0) {
      console.error(`[cron/emails] falhas em ${label}:`, outcome.result.errors)
    }
  }

  const status = digest.ok || reminders.ok ? 200 : 500
  return NextResponse.json({ digest, reminders }, { status })
}
