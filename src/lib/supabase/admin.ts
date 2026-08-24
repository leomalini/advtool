import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client com a `service_role`. **Ignora toda a RLS** deste projeto — é o único
 * caminho no código que enxerga e escreve tudo, sem perfil e sem policy.
 *
 * Regras de uso, sem exceção:
 *
 * 1. Só em Route Handlers (`src/app/api/**`). Nunca num Client Component, nunca
 *    num Server Component que renderiza árvore de UI.
 * 2. Toda rota que o usa checa a autorização ANTES, com o client de sessão
 *    (`@/lib/supabase/server`) — tipicamente `is_admin()` no banco. O perfil do
 *    chamador jamais vem do corpo da requisição.
 * 3. A variável não tem prefixo `NEXT_PUBLIC_` e nunca deve ganhar um. Sem o
 *    prefixo, o Next não a inclui no bundle do browser; com ele, a chave que
 *    abre o banco inteiro iria para dentro do JavaScript público.
 *
 * Verificação pós-build: `grep -r "service_role" .next/static/` tem que vir
 * vazio.
 */
export function createAdminClient(): SupabaseClient {
  // Cinto de segurança para o caso de alguém importar isto de um componente:
  // falha alto no desenvolvimento em vez de vazar em silêncio.
  if (typeof window !== 'undefined') {
    throw new Error(
      '[supabase/admin] Client de service_role importado no browser. ' +
        'Este módulo só pode ser usado em Route Handlers.'
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ausente. Gere a chave em Project Settings → ' +
        'API e adicione ao .env local e às variáveis do host de produção.'
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** `true` quando a chave está configurada — deixa as rotas responderem 503 com
 * uma explicação em vez de estourar. Mesmo padrão já usado pelas rotas do
 * BuscaProcessos quando falta a API key. */
export function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
