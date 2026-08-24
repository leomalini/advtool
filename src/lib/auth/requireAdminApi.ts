import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type AdminGuardResult =
  | { ok: false; response: NextResponse }
  | { ok: true; userId: string }

/**
 * Porteiro das rotas de administração.
 *
 * O ponto inteiro é a ORDEM: a autorização acontece aqui, com o client de
 * SESSÃO, antes de qualquer linha tocar o client de service_role. O perfil
 * nunca vem do corpo da requisição — vem de `is_admin()` no banco, a mesma
 * função que as policies usam.
 *
 * Devolve o id de quem chamou quando autoriza, porque é ele que vai como
 * `actor_id` na trilha de auditoria.
 *
 * Códigos seguem a convenção do projeto: 401 é "não sei quem você é", 403 é
 * "sei quem você é e não pode". Nenhum dos dois vaza detalhe interno.
 */
export async function requireAdminApi(): Promise<AdminGuardResult> {
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

  const { data: isAdmin, error } = await supabase.rpc('is_admin')

  if (error) {
    // Modo de falha mais provável: migration 34 não aplicada nesta base.
    console.error('[auth] rpc is_admin() falhou:', error.code, error.message)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Não foi possível verificar suas permissões.' },
        { status: 500 }
      ),
    }
  }

  if (isAdmin !== true) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id }
}
