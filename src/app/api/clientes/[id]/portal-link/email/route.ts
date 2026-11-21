import { createElement } from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { requestPublicOrigin } from '@/lib/appUrl'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { buildPortalUrl } from '@/lib/clientPortal/token'
import { openPortalToken } from '@/lib/clientPortal/vault'
import { getEmailConfig } from '@/lib/email/config'
import { loadOfficeIdentity } from '@/lib/email/office'
import { renderEmail } from '@/lib/email/render'
import { sendEmail } from '@/lib/email/send'
import { PortalLinkEmail, portalLinkSubject } from '@/emails/PortalLinkEmail'
import { getClientGreetingName } from '@/types/cliente.types'
import { pickClientEmail, type ContactSource } from '@/utils/clientContacts'

/**
 * POST /api/clientes/<id>/portal-link/email — manda o link de acompanhamento
 * ativo para o e-mail do cliente.
 *
 * Manda o link QUE JÁ EXISTE, sem emitir outro: emitir revoga o anterior, e
 * "enviar por e-mail" não pode invalidar o link que o cliente talvez já tenha
 * recebido pelo WhatsApp. Por isso exige link ativo e recuperável
 * (`token_sealed`, migration 58) — o mesmo que a tela consegue exibir.
 *
 * Mesma permissão de emitir o link (`clientes:update`): mandar o acesso para
 * fora é tão sensível quanto gerá-lo.
 */

interface ClientRow extends ContactSource {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
  is_client: boolean
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) {
    return error(503, 'Envio indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.')
  }

  // Antes de qualquer leitura: sem configuração, a resposta é a mesma para
  // todo cliente, e o botão da tela já deveria estar desabilitado.
  const config = getEmailConfig()
  if (!config) {
    return error(503, 'O envio de e-mail não está configurado (ver Configurações → E-mail).')
  }

  const { id } = await params
  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select(
      'id, type, name, company_name, trade_name, email, phone, is_client, contacts:client_contacts(type, value, is_primary)'
    )
    .eq('id', id)
    .maybeSingle()

  if (clientError) {
    console.error('[portal-link/email] cliente não lido:', clientError.message)
    return error(500, 'Erro ao carregar o cliente.')
  }
  if (!client) return error(404, 'Cliente não encontrado.')

  const row = client as unknown as ClientRow
  if (!row.is_client) {
    return error(409, 'Só clientes têm link de acompanhamento.')
  }

  const to = pickClientEmail(row)
  if (!to) {
    return error(409, 'O cadastro não tem um e-mail válido. Inclua um e-mail e tente de novo.')
  }

  const { data: link, error: linkError } = await admin
    .from('client_portal_links')
    .select('token_sealed, token_hint')
    .eq('client_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  if (linkError) {
    console.error('[portal-link/email] link não lido:', linkError.message)
    return error(500, 'Erro ao carregar o link de acompanhamento.')
  }
  if (!link) {
    return error(409, 'Este cliente não tem link de acompanhamento ativo. Gere o link antes de enviar.')
  }

  const token = await openPortalToken(link.token_sealed as string | null)
  if (!token) {
    return error(
      409,
      'O link atual não pode ser recuperado para envio (foi emitido antes desta função). Gere um novo e envie.'
    )
  }

  const portalUrl = buildPortalUrl(requestPublicOrigin(request.nextUrl.origin), token)
  const office = await loadOfficeIdentity(admin)
  const content = await renderEmail(
    createElement(PortalLinkEmail, {
      office,
      greetingName: getClientGreetingName(row),
      documentLabel: row.type === 'company' ? 'CNPJ' : 'CPF',
      portalUrl,
    })
  )

  const result = await sendEmail(
    admin,
    {
      kind: 'portal_link',
      resource: 'clientes',
      clientId: id,
      to,
      subject: portalLinkSubject(office),
      content,
      office,
      sentBy: guard.userId,
      // A cópia guardada mostra o link como a tela mostra: pelo final.
      redactions: [{ secret: token, replacement: `••••${link.token_hint as string}` }],
    },
    config
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status })
  }

  return NextResponse.json(
    { message: result.message },
    { status: 201, headers: { 'Cache-Control': 'no-store, private' } }
  )
}
