import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { recordAdminActivity } from '@/lib/auth/recordAdminActivity'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { buildAccessLink } from '@/lib/auth/accessLink'
import { inviteUserSchema } from '@/schemas/user.schema'
import type { AdminUser, InviteUserResult } from '@/types/user.types'
import type { AppRole } from '@/types/permission.types'

/** Um escritório não passa disso. Se passar, a listagem trunca em silêncio —
 * momento de paginar de verdade. */
const MAX_USERS = 200

function serviceUnavailable() {
  return NextResponse.json(
    {
      error:
        'Gestão de usuários indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.',
    },
    { status: 503 }
  )
}

/**
 * GET /api/admin/users — lista os usuários do escritório.
 *
 * Junta `public.profiles` (perfil, status, OAB) com `auth.users` (e-mail,
 * confirmação, último acesso). A segunda metade só é acessível pela
 * service_role, que é a razão de esta rota existir em vez de um `select`
 * direto do browser.
 */
export async function GET() {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) return serviceUnavailable()

  try {
    const admin = createAdminClient()

    const [{ data: authData, error: authError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: MAX_USERS }),
        admin.from('profiles').select('*').order('full_name'),
      ])

    if (authError || profilesError) {
      console.error(
        '[admin/users] listagem falhou:',
        authError?.message ?? profilesError?.message
      )
      return NextResponse.json({ error: 'Erro ao carregar usuários.' }, { status: 500 })
    }

    const authById = new Map(authData.users.map((u) => [u.id, u]))

    const users: AdminUser[] = (profiles ?? []).map((profile) => {
      const authUser = authById.get(profile.id)

      return {
        id: profile.id,
        full_name: profile.full_name,
        email: authUser?.email ?? '',
        role: profile.role as AppRole,
        is_active: profile.is_active,
        oab_number: profile.oab_number,
        oab_state: profile.oab_state,
        created_at: profile.created_at,
        // Convite aceito == e-mail confirmado. É o mesmo sinal que o Supabase
        // usa, e vale tanto para convite quanto para conta criada à mão.
        invite_pending: authUser ? !authUser.email_confirmed_at : false,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
      }
    })

    return NextResponse.json({ users })
  } catch (err) {
    console.error('[admin/users] GET:', err)
    return NextResponse.json({ error: 'Erro ao carregar usuários.' }, { status: 500 })
  }
}

/**
 * POST /api/admin/users — convida alguém para o escritório.
 *
 * Dois passos, nesta ordem e por um motivo:
 *
 *   1. `inviteUserByEmail` cria a conta em `auth.users` e dispara o e-mail. O
 *      trigger `handle_new_user` cria o profile como `attorney` INATIVO.
 *   2. A service_role grava o perfil escolhido e ativa a conta.
 *
 * O perfil não viaja no metadata do convite de propósito: metadata é escolhido
 * por quem chama `/auth/v1/signup`, então lê-lo no trigger seria auto-promoção
 * a admin por HTTP (ver cabeçalho da migration 34). Aqui o valor já passou pelo
 * `requireAdminApi` e pelo Zod.
 *
 * ⚠️ Se o passo 1 falhar por causa do E-MAIL, cai em `generateLink`, que
 * **também cria a conta** (está na doc do método) mas não envia nada — e a
 * resposta traz o `action_link` para o admin entregar por WhatsApp.
 *
 * Isso não é um caso de borda: sem SMTP próprio, o serviço embutido do Supabase
 * entrega só para endereços pré-autorizados da organização, então convidar um
 * colega de fora falha **sempre**. Sem este fallback, o escritório não conseguia
 * sequer criar a conta — a rota abortava e nenhum usuário nascia.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) return serviceUnavailable()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const parsed = inviteUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' },
      { status: 400 }
    )
  }

  const { email, full_name, role, oab_number, oab_state } = parsed.data

  try {
    const admin = createAdminClient()
    const origin = request.nextUrl.origin

    const redirectTo = `${origin}/api/auth/callback?next=/definir-senha`
    const metadata = { full_name, oab_number, oab_state }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo,
    })

    // E-mail duplicado é o único caso que o admin resolve sozinho, e nenhum
    // fallback ajuda: a conta já existe. Sai antes de tentar o link.
    if (error?.message?.toLowerCase().includes('already')) {
      return NextResponse.json({ error: 'Já existe uma conta com este e-mail.' }, { status: 409 })
    }

    let usuario = data?.user ?? null
    let linkManual: string | undefined
    let motivoDaQueda: string | undefined

    if (error || !usuario) {
      console.error('[admin/users] convite por e-mail falhou:', error?.message)

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: metadata, redirectTo },
      })

      if (linkError || !link?.user) {
        console.error('[admin/users] geração do link falhou:', linkError?.message)
        return NextResponse.json(
          { error: 'Não foi possível criar o convite.' },
          { status: 500 }
        )
      }

      usuario = link.user
      linkManual = buildAccessLink(origin, link.properties.hashed_token, 'invite')
      motivoDaQueda = /rate|limit|seconds/i.test(error?.message ?? '')
        ? 'O limite de envio de e-mails foi atingido.'
        : 'O e-mail não pôde ser enviado.'
    }

    // Passo 2. O trigger já criou o profile; aqui ele recebe o perfil real e é
    // ativado. A service_role passa direto pelo trigger anti-escalada.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ full_name, role, oab_number, oab_state, is_active: true })
      .eq('id', usuario.id)

    if (profileError) {
      // A conta existe mas ficou inativa como `attorney`. Melhor dizer isso do
      // que fingir sucesso — o admin corrige pela própria tela.
      console.error('[admin/users] perfil pós-convite falhou:', profileError.message)
      return NextResponse.json(
        {
          error:
            'Convite enviado, mas o perfil não pôde ser definido. Ajuste o perfil e ative a conta na lista.',
        },
        { status: 500 }
      )
    }

    await recordAdminActivity(admin, {
      type: 'user_invited',
      targetId: usuario.id,
      targetName: full_name,
      actorId: guard.userId,
      metadata: { email, role, via: linkManual ? 'link' : 'email' },
    })

    const result: InviteUserResult = {
      id: usuario.id,
      action_link: linkManual,
      reason: motivoDaQueda,
    }
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[admin/users] POST:', err)
    return NextResponse.json({ error: 'Não foi possível enviar o convite.' }, { status: 500 })
  }
}
