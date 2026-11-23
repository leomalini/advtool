import { createElement } from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { getEmailConfig } from '@/lib/email/config'
import { loadOfficeIdentity } from '@/lib/email/office'
import { renderEmail } from '@/lib/email/render'
import { sendEmail } from '@/lib/email/send'
import { ClientMessageEmail, type MessageSignature } from '@/emails/ClientMessageEmail'
import { clientMessageRequestSchema } from '@/schemas/clientMessage.schema'
import { pickClientEmail, type ContactSource } from '@/utils/clientContacts'

/**
 * POST /api/clientes/<id>/emails — a mensagem avulsa que alguém do escritório
 * escreve para o cliente.
 *
 *   `{ subject, body, preview: true }` — só monta e devolve o HTML, para a
 *       tela mostrar como o cliente vai ler. Não grava nada.
 *   `{ subject, body }` — manda e registra em `email_messages`.
 *
 * `clientes:update`, como o link do portal: falar com o cliente em nome do
 * escritório é ação, não leitura. Assina quem manda — o nome e a OAB vêm da
 * conta de quem pediu, nunca do corpo.
 */

interface ClientRow extends ContactSource {
  id: string
  is_client: boolean
}

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

/** 'OAB/ES 12345', como a tela de Publicações escreve; sem UF, só o número. */
function formatOab(number: string | null, state: string | null): string | null {
  const digits = number?.trim()
  if (!digits) return null
  return state?.trim() ? `OAB/${state.trim()} ${digits}` : `OAB ${digits}`
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

  const parsed = clientMessageRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return error(400, parsed.error.issues[0]?.message ?? 'Mensagem inválida.')
  }
  const { subject, body, preview } = parsed.data

  // A prévia funciona sem o envio configurado: escrever não depende dele.
  const config = getEmailConfig()
  if (!preview && !config) {
    return error(503, 'O envio de e-mail não está configurado (Configurações → E-mail).')
  }

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: client, error: clientError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from('clients')
        .select('id, email, phone, is_client, contacts:client_contacts(type, value, is_primary)')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('profiles')
        .select('full_name, oab_number, oab_state')
        .eq('id', guard.userId)
        .maybeSingle(),
    ])

  if (clientError || profileError) {
    console.error('[clientes/emails] leitura falhou:', clientError?.message ?? profileError?.message)
    return error(500, 'Erro ao carregar o cliente.')
  }
  if (!client) return error(404, 'Cliente não encontrado.')

  const row = client as unknown as ClientRow
  if (!row.is_client) return error(409, 'Só clientes recebem e-mail do escritório.')
  const to = pickClientEmail(row)
  if (!to) return error(409, 'O cadastro não tem um e-mail válido.')

  const signer = profile as { full_name: string; oab_number: string | null; oab_state: string | null } | null
  const signature: MessageSignature = {
    name: signer?.full_name?.trim() || 'Escritório',
    oab: formatOab(signer?.oab_number ?? null, signer?.oab_state ?? null),
  }

  const office = await loadOfficeIdentity(admin)
  const content = await renderEmail(createElement(ClientMessageEmail, { office, body, signature }))

  if (preview) {
    return NextResponse.json(
      { preview: { to, subject, html: content.html } },
      { headers: { 'Cache-Control': 'no-store, private' } }
    )
  }

  const result = await sendEmail(
    admin,
    {
      kind: 'custom_message',
      resource: 'clientes',
      clientId: id,
      to,
      subject,
      content,
      office,
      sentBy: guard.userId,
    },
    config
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status })
  }
  return NextResponse.json({ message: result.message }, { status: 201 })
}
