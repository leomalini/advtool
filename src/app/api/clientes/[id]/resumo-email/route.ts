import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  describeDigestSubscription,
  loadDigestClient,
  recordDigestActivity,
} from '@/lib/email/digestSubscription'
import { DIGEST_BLOCKER_LABELS } from '@/types/emailMessage.types'

/**
 * O resumo diário de um cliente, na ficha.
 *
 *   GET — a situação: ligado desde quando, se o cliente pediu para sair, para
 *         onde iria e o que impede (`clientes:view`).
 *   PUT — `{ enabled }` liga ou desliga (`clientes:update`). Ligar confere
 *         todos os requisitos e recusa com 409 listando os que faltam.
 *
 * Service_role depois da permissão: a regra lê os links do portal, que não
 * têm leitura por RLS, e abre o token cifrado.
 */

const bodySchema = z.object({ enabled: z.boolean() })

function serviceUnavailable() {
  return NextResponse.json(
    { error: 'Indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' },
    { status: 503 }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'view')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return serviceUnavailable()

  const { id } = await params
  const admin = createAdminClient()

  try {
    const client = await loadDigestClient(admin, id)
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    const subscription = await describeDigestSubscription(admin, client)
    return NextResponse.json({ subscription }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) {
    console.error('[resumo-email] situação não lida:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível carregar o resumo por e-mail.' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return serviceUnavailable()

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Corpo inválido: esperado { enabled: boolean }.' }, { status: 400 })
  }

  const { id } = await params
  const admin = createAdminClient()

  try {
    const client = await loadDigestClient(admin, id)
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

    if (parsed.data.enabled) {
      const current = await describeDigestSubscription(admin, client)
      if (current.blockers.length > 0) {
        return NextResponse.json(
          {
            error: current.blockers.map((blocker) => DIGEST_BLOCKER_LABELS[blocker]).join(' '),
            subscription: current,
          },
          { status: 409 }
        )
      }
    }

    // Ligar de novo quem já estava ligado não mexe na data: ela é a fronteira
    // dos atos que entram, e andar com ela perderia os do intervalo.
    if (parsed.data.enabled === (client.email_updates_enabled_at !== null)) {
      return NextResponse.json({ subscription: await describeDigestSubscription(admin, client) })
    }

    // Religar à mão apaga o pedido de saída: a tela pede confirmação antes,
    // dizendo quando o cliente pediu.
    const patch = parsed.data.enabled
      ? { email_updates_enabled_at: new Date().toISOString(), email_updates_opted_out_at: null }
      : { email_updates_enabled_at: null }

    const { error } = await admin.from('clients').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    await recordDigestActivity(admin, [client], guard.userId, parsed.data.enabled)

    const updated = await loadDigestClient(admin, id)
    if (!updated) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    return NextResponse.json({ subscription: await describeDigestSubscription(admin, updated) })
  } catch (error) {
    console.error('[resumo-email] não alterado:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível alterar o resumo por e-mail.' }, { status: 500 })
  }
}
