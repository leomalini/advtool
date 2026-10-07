import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { verifyInfinitePayHandle } from '@/lib/infinitepay/charges'
import { infinitePayHandleSchema } from '@/schemas/officeSettings.schema'

/**
 * POST /api/financeiro/infinitepay/verificar-conta — confere se uma InfiniteTag
 * aceita link de pagamento, antes de um cliente receber um link quebrado.
 *
 * Quem configura a conta é quem administra Configurações, então é essa a
 * permissão. A tag vem no corpo: a tela verifica o que acabou de ser salvo,
 * sem depender de reler a linha.
 */
export async function POST(request: Request) {
  const guard = await requireApiPermission('configuracoes', 'manage')
  if (!guard.ok) return guard.response

  const body: unknown = await request.json().catch(() => null)
  const handle = infinitePayHandleSchema.safeParse(
    typeof body === 'object' && body !== null ? (body as { handle?: unknown }).handle : undefined,
  )
  if (!handle.success || handle.data === '') {
    return NextResponse.json({ error: 'Informe a InfiniteTag.' }, { status: 400 })
  }

  try {
    const result = await verifyInfinitePayHandle(handle.data)
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code, actionUrl: result.actionUrl },
        { status: 200 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[infinitepay] verificação da conta falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível falar com a InfinitePay agora.' },
      { status: 502 },
    )
  }
}
