import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { getBalance } from '@/lib/d4sign/account'
import { d4signErrorResponse } from '@/lib/d4sign/http'

/**
 * POST /api/assinaturas/d4sign/saldo — lê o saldo de envios e guarda o último
 * valor em `office_settings`. É também o "Testar conexão": chave errada volta
 * como erro da D4Sign.
 *
 * POST, e não GET: gasta uma das 10 chamadas por hora e grava. Só para quem
 * administra Configurações; os demais veem o último valor guardado.
 */
export async function POST() {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY ausente no servidor.' },
      { status: 503 },
    )
  }

  let balance: Awaited<ReturnType<typeof getBalance>>
  try {
    balance = await getBalance()
  } catch (error) {
    return d4signErrorResponse(error, 'consultar o saldo da D4Sign')
  }

  const { data: settings, error } = await createAdminClient()
    .from('office_settings')
    .upsert(
      {
        id: true,
        d4sign_balance_credit: balance.credit,
        d4sign_balance_sent: balance.sent,
        d4sign_balance_checked_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()

  if (error) {
    console.error('[d4sign] saldo não gravado:', error.message)
    return NextResponse.json(
      { error: 'A D4Sign respondeu, mas o saldo não foi gravado.', balance },
      { status: 500 },
    )
  }

  return NextResponse.json({ settings })
}
