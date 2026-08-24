import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { recordAdminActivity } from '@/lib/auth/recordAdminActivity'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { updateUserSchema } from '@/schemas/user.schema'

/**
 * PATCH /api/admin/users/[id] — troca o perfil e/ou ativa/desativa a conta.
 *
 * Não existe DELETE, e não é omissão: `created_by`, `author_id`, `actor_id` e
 * `uploaded_by` referenciam `profiles` em quase todas as tabelas. Apagar um
 * usuário exigiria apagar ou órfãos o histórico dele. Desativar preserva a
 * autoria e corta o acesso na mesma hora — `public.can()` filtra por
 * `is_active`, então a próxima requisição da pessoa já não passa.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Gestão de usuários indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada.' },
      { status: 503 }
    )
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' },
      { status: 400 }
    )
  }

  const patch = parsed.data

  try {
    const admin = createAdminClient()

    const { data: alvo, error: alvoError } = await admin
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', id)
      .maybeSingle()

    if (alvoError) {
      console.error('[admin/users] leitura do alvo falhou:', alvoError.message)
      return NextResponse.json({ error: 'Erro ao atualizar usuário.' }, { status: 500 })
    }
    if (!alvo) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // ── Guarda contra trancar o escritório para fora da própria gestão ──────
    //
    // Cobre os dois caminhos: rebaixar o último admin e desativá-lo. É o
    // risco #5 do planejamento, e a única forma de sair dele seria SQL manual.
    const perdeAdmin =
      alvo.role === 'admin' &&
      alvo.is_active &&
      ((patch.role !== undefined && patch.role !== 'admin') || patch.is_active === false)

    if (perdeAdmin) {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('is_active', true)

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          {
            error:
              'Este é o último administrador ativo. Promova outra pessoa a administrador antes de alterar este acesso.',
          },
          { status: 409 }
        )
      }
    }

    // Auto-rebaixamento continua permitido quando existe outro admin — o que
    // não pode é ser acidental, então a tela confirma antes de chamar aqui.
    const { error } = await admin.from('profiles').update(patch).eq('id', id)

    if (error) {
      console.error('[admin/users] update falhou:', error.message)
      return NextResponse.json({ error: 'Erro ao atualizar usuário.' }, { status: 500 })
    }

    // Uma linha de auditoria por dimensão alterada: trocar o perfil e desativar
    // na mesma requisição são dois fatos distintos para quem lê o feed depois.
    if (patch.role !== undefined && patch.role !== alvo.role) {
      await recordAdminActivity(admin, {
        type: 'user_role_changed',
        targetId: alvo.id,
        targetName: alvo.full_name,
        actorId: guard.userId,
        metadata: { de: alvo.role, para: patch.role },
      })
    }

    if (patch.is_active !== undefined && patch.is_active !== alvo.is_active) {
      await recordAdminActivity(admin, {
        type: patch.is_active ? 'user_reactivated' : 'user_deactivated',
        targetId: alvo.id,
        targetName: alvo.full_name,
        actorId: guard.userId,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/users] PATCH:', err)
    return NextResponse.json({ error: 'Erro ao atualizar usuário.' }, { status: 500 })
  }
}

/** Explicitamente não implementado — ver o comentário do PATCH. */
export async function DELETE() {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  return NextResponse.json(
    {
      error:
        'Usuários não são excluídos: o histórico de casos, tarefas e lançamentos referencia a autoria. Desative a conta.',
    },
    { status: 405 }
  )
}
