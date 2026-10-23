import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { registerSafeWebhook } from '@/lib/d4sign/account'
import { D4SignApiError } from '@/lib/d4sign/client'
import { d4signErrorResponse } from '@/lib/d4sign/http'
import { d4signWebhookEndpoint } from '@/lib/d4sign/urls'

const bodySchema = z.object({
  uuid: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
})

/** Erros em que salvar o cofre não faz sentido: a conta nem respondeu. */
const BLOCKING_KINDS = new Set(['not_configured', 'auth'])

/**
 * PUT /api/assinaturas/d4sign/cofre — escolhe o cofre e registra nele o
 * webhook (2.0, um para o cofre inteiro).
 *
 * A tela mostra o endereço antes de confirmar: o `.env` local aponta
 * `APP_PUBLIC_URL` para a produção (ver `lib/d4sign/urls.ts`).
 *
 * Se o registro falhar por outro motivo que não as chaves, o cofre é salvo
 * assim mesmo e a resposta diz o que faltou — escolher de novo tenta outra vez.
 * Com o mesmo cofre, o registro anterior é mantido.
 */
export async function PUT(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' },
      { status: 503 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Escolha um cofre da lista.' }, { status: 400 })
  }
  const safe = parsed.data
  const endpoint = d4signWebhookEndpoint()

  let webhookError: string | null = endpoint
    ? null
    : 'Sem endereço público (APP_PUBLIC_URL ou D4SIGN_WEBHOOK_URL): nenhum aviso foi registrado.'

  if (endpoint) {
    try {
      await registerSafeWebhook(safe.uuid, endpoint)
    } catch (error) {
      if (error instanceof D4SignApiError && BLOCKING_KINDS.has(error.kind)) {
        return d4signErrorResponse(error, 'registrar o webhook do cofre')
      }
      console.error('[d4sign] webhook do cofre não registrado:', error)
      webhookError =
        error instanceof Error ? error.message : 'A D4Sign não registrou o webhook do cofre.'
    }
  }

  const supabase = createAdminClient()
  const { data: current, error: readError } = await supabase
    .from('office_settings')
    .select('d4sign_safe_uuid, d4sign_webhook_url, d4sign_webhook_registered_at')
    .maybeSingle()
  if (readError) {
    console.error('[d4sign] configuração atual não lida:', readError.message)
    return NextResponse.json({ error: 'Não foi possível salvar o cofre agora.' }, { status: 500 })
  }

  const registered = endpoint !== null && webhookError === null
  const keepPrevious = !registered && current?.d4sign_safe_uuid === safe.uuid

  const { data: settings, error: saveError } = await supabase
    .from('office_settings')
    .upsert(
      {
        id: true,
        d4sign_safe_uuid: safe.uuid,
        d4sign_safe_name: safe.name,
        d4sign_webhook_url: registered
          ? endpoint
          : keepPrevious
            ? (current?.d4sign_webhook_url ?? null)
            : null,
        d4sign_webhook_registered_at: registered
          ? new Date().toISOString()
          : keepPrevious
            ? (current?.d4sign_webhook_registered_at ?? null)
            : null,
        updated_by: guard.userId,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()

  if (saveError) {
    console.error('[d4sign] cofre não salvo:', saveError.message)
    return NextResponse.json({ error: 'Não foi possível salvar o cofre agora.' }, { status: 500 })
  }

  return NextResponse.json({ settings, webhook: { registered, error: webhookError } })
}
