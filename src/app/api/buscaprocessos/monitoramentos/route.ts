import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createMonitoramento,
  listMonitoramentos,
  BpApiError,
  type CreateMonitorInput,
} from '@/lib/buscaprocessos/client'

const createSchema = z.object({
  numeroCnj: z.string().min(1, 'Número CNJ obrigatório'),
  frequencia: z.enum(['DIARIA', 'SEMANAL', 'MENSAL']),
  webhookUrl: z.string().url('URL inválida').optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    const { data } = await listMonitoramentos()
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  try {
    const { data } = await createMonitoramento(parsed.data as CreateMonitorInput)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
