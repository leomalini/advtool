import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const querySchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos sem formatação'),
})

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const parsed = querySchema.safeParse({ cnpj: searchParams.get('cnpj') ?? '' })

  if (!parsed.success) {
    return NextResponse.json({ error: 'CNPJ inválido' }, { status: 400 })
  }

  const { cnpj } = parsed.data

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { 'User-Agent': 'advtool/1.0' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Erro ao consultar CNPJ' }, { status: 502 })
    }

    const data = await res.json()

    return NextResponse.json({
      company_name: data.razao_social ?? null,
      trade_name: data.nome_fantasia ?? null,
      phone: data.ddd_telefone_1
        ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}`
        : null,
      email: data.email ?? null,
      address_street: data.logradouro ?? null,
      address_number: data.numero ?? null,
      address_complement: data.complemento ?? null,
      address_neighborhood: data.bairro ?? null,
      address_city: data.municipio ?? null,
      address_state: data.uf ?? null,
      address_zip: data.cep ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Falha na conexão com BrasilAPI' }, { status: 502 })
  }
}
