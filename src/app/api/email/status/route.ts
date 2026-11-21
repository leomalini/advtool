import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isEmailConfigured } from '@/lib/email/config'

/**
 * GET /api/email/status — o servidor consegue mandar e-mail?
 *
 * Para as telas que ficam fundo demais na árvore para receber isso do Server
 * Component da página (o lançamento do Financeiro abre em painel lateral, de
 * mais de uma tela). Só um booleano: a chave e o que falta configurar ficam em
 * Configurações → E-mail. Basta estar logado — não é dado de módulo nenhum.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  return NextResponse.json(
    { configured: isEmailConfigured() },
    { headers: { 'Cache-Control': 'no-store, private' } },
  )
}
