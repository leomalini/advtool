import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Action, Resource } from '@/types/permission.types'

export type PermissionGuardResult =
  | { ok: false; response: NextResponse }
  | { ok: true; userId: string }

/**
 * Porteiro das rotas de API que não são de administração.
 *
 * Mesma ordem e mesmos códigos de `requireAdminApi`, trocando `is_admin()` por
 * `can(resource, action)` — a mesma função que as policies usam, para que a
 * rota e a RLS nunca discordem sobre quem pode o quê.
 *
 * Existe porque nem toda rota devolve dado do banco: uma que gasta crédito
 * numa API paga precisa negar ANTES de chamar a API externa, e aí a RLS já
 * não protege nada — o dinheiro sai mesmo que nenhuma linha seja gravada.
 *
 * Devolve o id de quem chamou porque é ele que vira `searched_by`/`created_by`
 * no registro da ação.
 */
export async function requirePermissionApi(
  resource: Resource,
  action: Action = 'view'
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
    // Falha ao AVALIAR não é negação: o modo mais provável é a migration 34
    // não aplicada nesta base, e responder 403 aqui acusaria o usuário de algo
    // que é problema de infraestrutura.
    console.error('[auth] rpc can() falhou:', error.code, error.message)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Não foi possível verificar suas permissões.' },
        { status: 500 }
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
