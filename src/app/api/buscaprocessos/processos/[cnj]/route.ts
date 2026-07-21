import { NextRequest, NextResponse } from 'next/server'
import { getProcessoByCnj, BpApiError } from '@/lib/buscaprocessos/client'
import type { BpParte, BpMovimento } from '@/lib/buscaprocessos/types'
import type { CnjLookupResult } from '@/types/case.types'

function extractParty(partes: BpParte[], polo: 'ativo' | 'passivo'): string | null {
  return partes.find((p) => p.polo === polo)?.nome ?? null
}

function latestMovimento(movimentos: BpMovimento[]): BpMovimento | null {
  if (movimentos.length === 0) return null
  return movimentos
    .slice()
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnj: string }> },
): Promise<NextResponse> {
  const { cnj } = await params

  try {
    const { data: processo } = await getProcessoByCnj(cnj)
    const last = latestMovimento(processo.movimentos)

    const result: CnjLookupResult = {
      cnj_number: processo.numero,
      court: processo.tribunal ?? null,
      court_division: processo.vara ?? null,
      plaintiff: extractParty(processo.partes, 'ativo'),
      defendant: extractParty(processo.partes, 'passivo'),
      subject: processo.assunto ?? null,
      last_movement: last?.titulo ?? null,
      last_movement_date: last?.data ?? null,
    }

    return NextResponse.json(result)
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
