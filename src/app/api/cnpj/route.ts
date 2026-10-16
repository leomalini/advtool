import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { lookupCnpj } from '@/lib/brasilapi/cnpj'

const querySchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos sem formatação'),
})

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const parsed = querySchema.safeParse({ cnpj: searchParams.get('cnpj') ?? '' })

  if (!parsed.success) {
    return NextResponse.json({ error: 'CNPJ inválido' }, { status: 400 })
  }

  const result = await lookupCnpj(parsed.data.cnpj)
  if (result.ok) return NextResponse.json(result.company)
  if (result.reason === 'not_found') {
    return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 })
  }
  if (result.reason === 'network') {
    return NextResponse.json({ error: 'Falha na conexão com BrasilAPI' }, { status: 502 })
  }
  return NextResponse.json({ error: 'Erro ao consultar CNPJ' }, { status: 502 })
}
