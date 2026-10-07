import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Action, Resource } from '@/types/permission.types'

export type PermissionGuardResult =
  | { ok: false; response: NextResponse }
  | { ok: true; userId: string }

/**
 * Porteiro das rotas que agem por um perfil que não é necessariamente o admin —
 * o par de `requireAdminApi`, com a mesma ordem: a autorização acontece aqui,
 * com o client de SESSÃO e pela mesma `public.can()` que as policies usam,
 * antes de qualquer linha tocar a service_role.
 *
 * É o que permite às tabelas de cobrança não terem policy de escrita
 * (migration 67): a rota confere a permissão, a service_role grava.
 *
 * 401 é "não sei quem você é", 403 é "sei e não pode". Nenhum vaza detalhe.
 */
export async function requireApiPermission(
  resource: Resource,
  action: Action,
): Promise<PermissionGuardResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
    }
  }

  const { data: allowed, error } = await supabase.rpc('can', {
    p_resource: resource,
    p_action: action,
  })

  if (error) {
    console.error('[auth] rpc can() falhou:', error.code, error.message)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Não foi possível verificar suas permissões.' },
        { status: 500 },
      ),
    }
  }

  if (allowed !== true) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id }
}
