import { createElement } from 'react'
import { NextResponse } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { getEmailConfig } from '@/lib/email/config'
import { loadOfficeIdentity } from '@/lib/email/office'
import { renderEmail } from '@/lib/email/render'
import { sendEmail } from '@/lib/email/send'
import { TEST_EMAIL_SUBJECT, TestEmail } from '@/emails/TestEmail'

/**
 * POST /api/email/teste — manda um e-mail de teste para quem clicou, com a
 * moldura e o remetente reais. É a conferência de ponta a ponta da
 * configuração: chave, domínio verificado, remetente e Reply-To.
 *
 * O destino é sempre o e-mail da conta de quem pede, nunca um campo do corpo:
 * a rota não vira um disparador de e-mail para qualquer endereço.
 */
export async function POST() {
  const guard = await requirePermissionApi('configuracoes', 'manage')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Envio indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' },
      { status: 503 }
    )
  }

  const config = getEmailConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'O envio de e-mail não está configurado — veja o que falta nesta mesma tela.' },
      { status: 503 }
    )
  }

  const admin = createAdminClient()
  const [{ data: account, error: accountError }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(guard.userId),
    admin.from('profiles').select('full_name').eq('id', guard.userId).maybeSingle(),
  ])

  const to = account?.user?.email
  if (accountError || !to) {
    if (accountError) console.error('[email/teste] conta não lida:', accountError.message)
    return NextResponse.json({ error: 'Sua conta não tem e-mail para receber o teste.' }, { status: 409 })
  }

  const office = await loadOfficeIdentity(admin)
  const fullName = (profile?.full_name as string | undefined)?.trim()
  const content = await renderEmail(
    createElement(TestEmail, {
      office,
      requestedBy: fullName?.split(/\s+/)[0] ?? null,
      fromAddress: config.fromAddress,
    })
  )

  const result = await sendEmail(
    admin,
    {
      kind: 'test',
      resource: 'configuracoes',
      to,
      subject: TEST_EMAIL_SUBJECT,
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
