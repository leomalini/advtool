import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Action, Resource } from '@/types/permission.types'

/**
 * Camada 2 do modelo de autorização (`docs/PLANEJAMENTO-MULTIUSUARIO.md` §4.3):
 * o portão de entrada de cada rota, resolvido no servidor antes do render.
 *
 * Chamado no `page.tsx` — e não no `proxy.ts` — de propósito. A doc do Next 16
 * é explícita em que Proxy serve para checagem otimista, não como solução de
 * autorização, e com o perfil vivendo no banco (e não num claim do JWT) uma
 * checagem no proxy custaria um roundtrip em toda navegação. Aqui é uma
 * chamada por página, no mesmo request que já abre conexão com o Supabase.
 *
 * Continua sendo conveniência: a garantia real de que o dado não sai é a RLS.
 * Esta função evita que alguém CHEGUE numa tela que não pode usar; a policy
 * evita que a tela devolva algo se a pessoa chegar assim mesmo.
 */
export async function requirePermission(
  resource: Resource,
  action: Action = 'view'
): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Mesma função que as policies usam — uma fonte de verdade só.
  const { data: allowed, error } = await supabase.rpc('can', {
    p_resource: resource,
    p_action: action,
  })

  // Falha fechada: sem resposta afirmativa, ninguém entra. O log existe porque
  // o modo de falha mais provável não é "sem permissão" e sim "migration 34 não
  // aplicada neste banco" — sem ele, todo mundo cai em /sem-acesso e a causa
  // fica invisível (PGRST202 = função `can` ausente do schema).
  if (error) {
    console.error('[auth] rpc can() falhou:', error.code, error.message)
  }

  if (allowed === true) return

  // Negado. O destino natural é o Dashboard, mas só funciona se a pessoa puder
  // vê-lo: uma conta desativada não pode ver nada, e mandá-la para /dashboard
  // dispararia o requirePermission de lá, que mandaria de volta para cá — loop
  // infinito de redirect. Por isso a segunda pergunta.
  const { data: hasDashboard } = await supabase.rpc('can', {
    p_resource: 'dashboard',
    p_action: 'view',
  })

  redirect(hasDashboard === true ? '/dashboard' : '/sem-acesso')
}
