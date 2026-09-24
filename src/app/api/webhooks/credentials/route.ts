import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/requireAdminApi'
import { checkConfiguredCredential } from '@/lib/buscaprocessos/signature'

/**
 * Confere a credencial do webhook contra um valor colado na tela.
 *
 * A variável da Vercel não pode ser lida de volta, e um valor errado nela só
 * aparecia como "toda entrega recusada". Aqui o administrador cola o que a
 * conta da BuscaProcessos mostra e recebe a resposta que o endpoint daria —
 * com o motivo quando diverge (caractere faltando, valor do campo vizinho…).
 *
 * Só admin, e sem registro do valor em lugar nenhum: a resposta diz o que
 * diverge, nunca o que está configurado.
 */

const checkSchema = z.object({
  kind: z.enum(['token', 'secret']),
  value: z.string().trim().min(1, 'Cole o valor exibido na conta.').max(512),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = checkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 422 },
    )
  }

  return NextResponse.json(checkConfiguredCredential(parsed.data.kind, parsed.data.value))
}
