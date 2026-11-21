import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { isValidUnsubscribeToken } from '@/lib/email/unsubscribe'

/**
 * POST /api/email/descadastrar?c=<cliente>&t=<token> — desliga o resumo
 * diário de um cliente, a pedido dele.
 *
 * Duas portas, o mesmo efeito:
 *   · o botão da página `/descadastrar`, que o link do rodapé abre;
 *   · o descadastro em um clique (RFC 8058): Gmail e Outlook fazem POST no
 *     endereço do cabeçalho `List-Unsubscribe`, com o corpo
 *     `List-Unsubscribe=One-Click`. O corpo não é conferido — a autorização é
 *     o token.
 *
 * Só POST, de propósito: antivírus de e-mail abrem (GET) todos os links de uma
 * mensagem, e um GET que desligasse o resumo desligaria o de todo mundo.
 *
 * Pública (sem sessão). O token é um HMAC do id do cliente; token errado e
 * cliente inexistente recebem a MESMA resposta, para a rota não servir de
 * consulta de ids.
 */

const querySchema = z.object({
  c: z.uuid(),
  t: z.string().min(16).max(128),
})

function invalid() {
  return NextResponse.json({ error: 'Link de descadastro inválido.' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const parsed = querySchema.safeParse({
    c: request.nextUrl.searchParams.get('c'),
    t: request.nextUrl.searchParams.get('t'),
  })
  if (!parsed.success) return invalid()
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'Indisponível no momento.' }, { status: 503 })
  }

  const { c: clientId, t: token } = parsed.data
  if (!(await isValidUnsubscribeToken(clientId, token))) return invalid()

  const now = new Date().toISOString()
  const { data, error } = await createAdminClient()
    .from('clients')
    .update({ email_updates_enabled_at: null, email_updates_opted_out_at: now })
    .eq('id', clientId)
    // Quem já tinha saído não ganha data nova: a primeira é a do pedido.
    .is('email_updates_opted_out_at', null)
    .select('id')

  if (error) {
    console.error('[email/descadastrar] cliente não atualizado:', error.message)
    return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 })
  }

  // Nenhuma linha: já tinha saído, ou o id não existe. As duas respostas são
  // iguais à de sucesso — o pedido do cliente está atendido em ambos os casos.
  return NextResponse.json(
    { ok: true, alreadyOptedOut: (data?.length ?? 0) === 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
