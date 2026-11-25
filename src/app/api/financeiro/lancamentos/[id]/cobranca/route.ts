import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import {
  getBillingForEntry,
  openBilling,
  updateBillingDescription,
  type BillingResult,
} from '@/lib/billing/billings'
import { loadBillingPanelItem } from '@/lib/billing/panel'
import {
  setBillingTerms,
  setClientOptOut,
  setPaused,
  setRecipientPhone,
  setReminders,
} from '@/lib/billing/reminders'
import { billingPageUrl } from '@/lib/billing/urls'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { billingTermsSchema } from '@/schemas/billingTerms.schema'

/**
 * A cobrança de um lançamento — a página `/pagar/<token>` (docs/cobrancas.md).
 *
 *   GET   a cobrança, a URL e a régua de hoje (`financeiro:view`). A URL só
 *         sai daqui: o token deriva de um segredo do servidor.
 *   POST  põe no ar — cria, ou religa a encerrada — e, com `reminders`, liga
 *         os lembretes (`financeiro:create`).
 *   PATCH troca a descrição, liga ou desliga os lembretes, pausa, troca o
 *         telefone, registra que o cliente não quer receber ou troca multa,
 *         juros e desconto no Pix (`financeiro:update`).
 *
 * A permissão é conferida com a sessão; a gravação vai pela service_role,
 * porque `billings` não tem policy de escrita (migrations 95 e 96).
 */

const postSchema = z.object({
  clientDescription: z.string().max(500).optional(),
  reminders: z.boolean().optional(),
})

const patchSchema = z
  .object({
    clientDescription: z.string().max(500).optional(),
    reminders: z.boolean().optional(),
    paused: z.boolean().optional(),
    recipientPhone: z.string().max(30).nullable().optional(),
    clientOptOut: z.boolean().optional(),
    terms: billingTermsSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nada a mudar.',
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
    const admin = createAdminClient()
    const origin = request.nextUrl.origin
    const billing = await getBillingForEntry(admin, entryId)
    if (!billing) return NextResponse.json({ billing: null, url: null, item: null })

    const panel = await loadBillingPanelItem(admin, { entryId, requestOrigin: origin })
    return NextResponse.json({
      billing,
      url: await billingPageUrl(billing.id, origin),
      item: panel?.item ?? null,
      officeName: panel?.officeName ?? null,
      officePhone: panel?.officePhone ?? null,
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

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })

  try {
    const admin = createAdminClient()
    let result = await openBilling(admin, {
      entryId,
      userId: guard.userId,
      clientDescription: parsed.data.clientDescription,
    })
    if (result.ok && parsed.data.reminders) {
      result = await setReminders(admin, { entryId, enabled: true })
    }
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
  const body = parsed.data

  try {
    const admin = createAdminClient()
    // Uma mudança por vez, na ordem: a primeira que falhar responde.
    const steps: (() => Promise<BillingResult>)[] = []
    if (body.clientDescription !== undefined) {
      const clientDescription = body.clientDescription
      steps.push(() => updateBillingDescription(admin, { entryId, clientDescription }))
    }
    if (body.reminders !== undefined) {
      const enabled = body.reminders
      steps.push(() => setReminders(admin, { entryId, enabled }))
    }
    if (body.paused !== undefined) {
      const paused = body.paused
      steps.push(() => setPaused(admin, { entryId, paused }))
    }
    if (body.recipientPhone !== undefined) {
      const phone = body.recipientPhone
      steps.push(() => setRecipientPhone(admin, { entryId, phone }))
    }
    if (body.clientOptOut !== undefined) {
      const optOut = body.clientOptOut
      steps.push(() => setClientOptOut(admin, { entryId, optOut }))
    }
    if (body.terms !== undefined) {
      const terms = body.terms
      steps.push(() => setBillingTerms(admin, { entryId, terms }))
    }

    let result: BillingResult | null = null
    for (const step of steps) {
      result = await step()
      if (!result.ok) break
    }
    if (!result) return NextResponse.json({ error: 'Nada a mudar.' }, { status: 400 })
    return await respond(result, request.nextUrl.origin)
  } catch (error) {
    return serverError('cobrança não foi alterada', error)
  }
}
