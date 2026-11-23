import { createClient } from '@/lib/supabase/server'

/**
 * Quem chama está logado no escritório? Para as rotas públicas da cobrança
 * não contarem como abertura ou clique do cliente o escritório conferindo o
 * próprio link. Não autoriza nada: só separa quem é quem.
 */
export async function hasOfficeSession(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user !== null
  } catch {
    // Na dúvida, conta como cliente: a abertura é informação, não permissão.
    return false
  }
}
