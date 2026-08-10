import { NextRequest, NextResponse } from 'next/server'
import { getProcessoByCnj, BpApiError } from '@/lib/buscaprocessos/client'
import type { BpParte, BpMovimento } from '@/lib/buscaprocessos/types'
import type { CnjLookupResult, LegalProcessPartyInput } from '@/types/legalProcess.types'

/**
 * Normaliza as partes da API.
 *
 * Antes daqui saía só `partes.find(p => p.polo === polo)?.nome` — uma parte por
 * polo, sem documento nem tipo. Um processo com três litisconsortes perdia dois
 * deles em silêncio.
 */
function mapParties(partes: BpParte[]): LegalProcessPartyInput[] {
  return partes
    .filter((p) => p.polo === 'ativo' || p.polo === 'passivo')
    .map((p, index) => ({
      name: p.nome,
      document: p.documento ?? null,
      polo: p.polo as 'ativo' | 'passivo',
      party_type: p.tipo ?? null,
      position: index,
    }))
}

/** Primeira parte de cada polo — mantida para os campos legados
 * plaintiff/defendant, que ainda servem de fallback na exibição. */
function firstPartyName(partes: BpParte[], polo: 'ativo' | 'passivo'): string | null {
  return partes.find((p) => p.polo === polo)?.nome ?? null
}

function latestMovimento(movimentos: BpMovimento[]): BpMovimento | null {
  if (movimentos.length === 0) return null
  return movimentos
    .slice()
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]
}

/** A API devolve status em texto livre; o banco aceita três valores. */
function mapStatus(status: string | null): 'ativo' | 'arquivado' | 'suspenso' | null {
  if (!status) return null
  const s = status.toLowerCase()
  if (s.includes('arquiv')) return 'arquivado'
  if (s.includes('suspen')) return 'suspenso'
  if (s.includes('ativo') || s.includes('andamento')) return 'ativo'
  return null
}

/** 'dd/MM/yyyy' ou ISO → 'yyyy-MM-dd', que é o formato da coluna date. */
function toIsoDate(value: string | null): string | null {
  if (!value) return null
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
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
      plaintiff: firstPartyName(processo.partes, 'ativo'),
      defendant: firstPartyName(processo.partes, 'passivo'),
      subject: processo.assunto ?? null,
      last_movement: last?.titulo ?? null,
      last_movement_date: last?.data ?? null,

      // Campos que a API sempre devolveu e que eram descartados aqui.
      procedural_class: processo.classe ?? null,
      case_value: processo.valor ?? null,
      filing_date: toIsoDate(processo.dataDistribuicao),
      status: mapStatus(processo.status),
      parties: mapParties(processo.partes),
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
