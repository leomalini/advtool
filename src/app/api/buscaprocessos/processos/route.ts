import { NextRequest, NextResponse } from 'next/server'
import { searchProcessosByDocument, BpApiError } from '@/lib/buscaprocessos/client'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cpfCnpj = req.nextUrl.searchParams.get('cpf_cnpj')
  const page = Number(req.nextUrl.searchParams.get('page') ?? '1')

  if (!cpfCnpj) {
    return NextResponse.json(
      { error: 'Parâmetro cpf_cnpj é obrigatório' },
      { status: 400 },
    )
  }

  try {
    const { data } = await searchProcessosByDocument(cpfCnpj, page)
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Timeout na API BuscaProcessos' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
