import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import {
  getBillingForEntry,
  openBilling,
  updateBillingDescription,
  type BillingResult,
} from '@/lib/billing/billings'
import { billingPageUrl } from '@/lib/billing/urls'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * A cobrança de um lançamento — a página `/pagar/<token>` (docs/cobrancas.md).
 *
 *   GET   a cobrança e a URL (`financeiro:view`). A URL só sai daqui: o token
 *         deriva de um segredo do servidor.
 *   POST  põe no ar: cria, ou religa a encerrada (`financeiro:create`).
 *   PATCH troca a descrição que o cliente vê (`financeiro:update`).
 *
 * A permissão é conferida com a sessão; a gravação vai pela service_role,
 * porque `billings` não tem policy de escrita (migration 95).
 */

const bodySchema = z.object({
  clientDescription: z.string().max(500).optional(),
})

const patchSchema = z.object({
  clientDescription: z.string().max(500),
})

function unavailable() {
  return NextResponse.json(
    { error: 'Cobrança indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
    { status: 503 },
  )
}

async function entryIdFrom(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params
  return z.uuid().safeParse(id).success ? id : null
}

async function respond(result: BillingResult, requestOrigin: string) {
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return NextResponse.json({
    billing: result.billing,
    url: await billingPageUrl(result.billing.id, requestOrigin),
  })
}

function serverError(context: string, error: unknown) {
  console.error(`[billing] ${context}:`, error)
  return NextResponse.json(
    { error: 'Não foi possível concluir agora. Tente de novo em instantes.' },
    { status: 500 },
  )
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission('financeiro', 'view')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return unavailable()

  const entryId = await entryIdFrom(params)
  if (!entryId) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })

  try {
    const billing = await getBillingForEntry(createAdminClient(), entryId)
    return NextResponse.json({
      billing,
      url: billing ? await billingPageUrl(billing.id, request.nextUrl.origin) : null,
    })
  } catch (error) {
    return serverError('leitura da cobrança falhou', error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission('financeiro', 'create')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return unavailable()

  const entryId = await entryIdFrom(params)
  if (!entryId) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  try {
    const result = await openBilling(createAdminClient(), {
      entryId,
      userId: guard.userId,
      clientDescription: parsed.data.clientDescription,
    })
    return await respond(result, request.nextUrl.origin)
  } catch (error) {
    return serverError('cobrança não foi posta no ar', error)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiPermission('financeiro', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return unavailable()

  const entryId = await entryIdFrom(params)
  if (!entryId) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  try {
    const result = await updateBillingDescription(createAdminClient(), {
      entryId,
      clientDescription: parsed.data.clientDescription,
    })
    return await respond(result, request.nextUrl.origin)
  } catch (error) {
    return serverError('descrição da cobrança não foi trocada', error)
  }
}
