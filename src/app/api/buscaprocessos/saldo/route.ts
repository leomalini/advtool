import { NextResponse } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { BpApiError } from '@/lib/buscaprocessos/client'
import { readCreditBalance } from '@/lib/buscaprocessos/creditBalance'

/**
 * Saldo de créditos da BuscaProcessos, para o dashboard.
 *
 * Rota porque a chave da API não sai do servidor. A consulta não é cobrada,
 * mas o saldo é da conta do escritório: só para `configuracoes:view`, quem já
 * vê a saúde da integração (`/api/webhooks/health`).
 */
export async function GET(): Promise<NextResponse> {
  const guard = await requirePermissionApi('configuracoes', 'view')
  if (!guard.ok) return guard.response

  try {
    return NextResponse.json(await readCreditBalance())
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/saldo] leitura falhou:', err)
    return NextResponse.json(
      { error: 'Não foi possível ler o saldo de créditos.' },
      { status: 500 },
    )
  }
}
