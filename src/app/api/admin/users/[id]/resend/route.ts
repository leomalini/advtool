import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { recordAdminActivity } from '@/lib/auth/recordAdminActivity'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { buildAccessLink, type AccessLinkType } from '@/lib/auth/accessLink'
import type { ResendInviteResult } from '@/types/user.types'

/**
 * POST /api/admin/users/[id]/resend — reemite o convite de quem ainda não o aceitou.
 *
 * `?via=link` pede o link direto; qualquer outro valor tenta o e-mail primeiro.
 *
 * Dois caminhos:
 *
 *   1. `inviteUserByEmail` no mesmo e-mail. Para uma conta que existe mas não
 *      confirmou, o GoTrue emite um token novo e dispara o e-mail de novo.
 *   2. `generateLink` produz o mesmo link SEM passar pelo e-mail, e a tela
 *      mostra para o admin entregar por outro canal.
 *
 * O caminho 2 é alcançado de duas formas, e a diferença aparece no `reason` da
 * resposta: **pedido de propósito** (`?via=link`, sem `reason`) ou **queda do
 * caminho 1** (com `reason` explicando por que o e-mail não saiu).
 *
 * Pedir o link de propósito é o modo de operação de quem ainda não configurou
 * SMTP: o serviço embutido do Supabase entrega só para endereços pré-autorizados
 * da organização, então convidar um colega por e-mail simplesmente não chega.
 * Entregar o link por WhatsApp resolve o onboarding sem nenhuma infraestrutura
 * de e-mail.
 *
 * **Os dois caminhos nunca rodam em sequência**: cada emissão invalida o token
 * anterior, então gerar o link depois de um envio bem-sucedido mataria
 * justamente o link que acabou de sair por e-mail.
 *
 * O `data` do convite original não é repassado: o profile já existe com nome,
 * perfil e OAB corretos desde o POST que convidou, e reenviar metadata só
 * abriria caminho para sobrescrevê-lo com valor velho.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Gestão de usuários indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 }
    )
  }

  const { id } = await params
  const via = request.nextUrl.searchParams.get('via') === 'link' ? 'link' : 'email'

  try {
    const admin = createAdminClient()

    const [{ data: profile, error: profileError }, { data: authData, error: authError }] =
      await Promise.all([
        admin.from('profiles').select('id, full_name, is_active').eq('id', id).maybeSingle(),
        admin.auth.admin.getUserById(id),
      ])

    if (profileError || authError) {
      console.error(
        '[admin/users] leitura para reenvio falhou:',
        profileError?.message ?? authError?.message
      )
      return NextResponse.json({ error: 'Erro ao reenviar o convite.' }, { status: 500 })
    }

    const authUser = authData?.user
    if (!profile || !authUser) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    if (!authUser.email) {
      return NextResponse.json(
        { error: 'Esta conta não tem e-mail cadastrado. Não é possível emitir um link.' },
        { status: 409 }
      )
    }
    // Reemitir para conta desativada devolveria o acesso que um admin cortou.
    if (!profile.is_active) {
      return NextResponse.json(
        { error: 'Conta desativada. Reative o acesso antes de emitir um novo link.' },
        { status: 409 }
      )
    }

    // Convite aceito == e-mail confirmado. A partir daí não existe mais
    // "convite" a reenviar; o que o admin pode emitir é um link de RECUPERAÇÃO,
    // que leva à mesma tela de definir senha.
    //
    // Não amplia o poder de ninguém: o admin já troca perfil, desativa contas e
    // enxerga todos os dados do escritório (decisão 2 do planejamento — não há
    // escopo por dono do registro). E emitir o link não invalida a senha atual
    // da pessoa; só abre a possibilidade de trocá-la.
    const jaAceitou = Boolean(authUser.email_confirmed_at)
    const tipoDoLink: AccessLinkType = jaAceitou ? 'recovery' : 'invite'

    if (jaAceitou && via === 'email') {
      return NextResponse.json(
        {
          error:
            'Este convite já foi aceito. Use "Link" para emitir uma redefinição de senha, ou peça à pessoa que use "Esqueci minha senha" no login.',
        },
        { status: 409 }
      )
    }

    const email = authUser.email
    const redirectTo = `${request.nextUrl.origin}/api/auth/callback?next=/definir-senha`

    // Fica preenchido só quando o e-mail foi TENTADO e falhou — é o que
    // distingue "o envio caiu" de "o admin pediu o link".
    let motivoDaQueda: string | undefined

    // ── Caminho 1: e-mail ───────────────────────────────────────────────────
    if (via === 'email') {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

      if (!inviteError) {
        await recordAdminActivity(admin, {
          type: 'user_invite_resent',
          targetId: profile.id,
          targetName: profile.full_name,
          actorId: guard.userId,
          metadata: { email, via: 'email' },
        })

        const result: ResendInviteResult = { sent: true, email }
        return NextResponse.json(result)
      }

      console.error('[admin/users] reenvio por e-mail falhou:', inviteError.message)

      // O motivo quase sempre é limite de envio, e é acionável ("espere e
      // tente de novo"), então vale dizer — sem repassar a mensagem crua do
      // GoTrue.
      motivoDaQueda = /rate|limit|seconds/i.test(inviteError.message)
        ? 'O limite de envio de e-mails foi atingido.'
        : 'O envio do e-mail falhou.'
    }

    // ── Caminho 2: link para entrega manual ─────────────────────────────────
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: tipoDoLink,
      email,
      options: { redirectTo },
    })

    if (linkError || !link) {
      console.error('[admin/users] geração do link falhou:', linkError?.message)
      return NextResponse.json(
        { error: 'Não foi possível gerar o link. Tente mais tarde.' },
        { status: 502 }
      )
    }

    await recordAdminActivity(admin, {
      type: 'user_invite_resent',
      targetId: profile.id,
      targetName: profile.full_name,
      actorId: guard.userId,
      metadata: { email, via: 'link' },
    })

    const result: ResendInviteResult = {
      sent: false,
      email,
      action_link: buildAccessLink(request.nextUrl.origin, link.properties.hashed_token, tipoDoLink),
      reason: motivoDaQueda,
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/users] POST resend:', err)
    return NextResponse.json({ error: 'Erro ao reenviar o convite.' }, { status: 500 })
  }
}
