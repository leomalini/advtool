// Mapeamento capa BuscaProcessos → CnjLookupResult.
//
// Vive fora das rotas porque dois caminhos precisam do mesmo mapa: a consulta
// síncrona (`/api/buscaprocessos/processos/[cnj]`) e a releitura do resultado
// assíncrono devolvido por um 202 (`/api/buscaprocessos/requests/[requestId]`).
import type { BpEnvolvido, BpFonte, BpProcessoCapa } from './types'
import type { CnjLookupResult, LegalProcessPartyInput } from '@/types/legalProcess.types'

/**
 * O mesmo processo chega repartido em `fontes` — um item por tribunal e grau
 * (1º grau, 2º grau, diário oficial). Capa e envolvidos vivem dentro da fonte,
 * não no topo de `data`. Preferimos a fonte de menor grau que tenha capa: é a
 * origem do processo, com órgão julgador e valor da causa preenchidos.
 */
function primaryFonte(fontes: BpFonte[]): BpFonte | null {
  const withCapa = fontes.filter((f) => f.capa)
  const pool = withCapa.length > 0 ? withCapa : fontes
  if (pool.length === 0) return null
  return pool
    .slice()
    .sort((a, b) => (a.grau ?? Number.MAX_SAFE_INTEGER) - (b.grau ?? Number.MAX_SAFE_INTEGER))[0]
}

/**
 * `envolvidos` mistura partes, advogados e magistrados: o campo `polo` vem em
 * CAIXA ALTA e assume também 'ADVOGADO' e 'NENHUM'. Só ATIVO e PASSIVO viram
 * partes do processo.
 */
function mapParties(envolvidos: BpEnvolvido[]): LegalProcessPartyInput[] {
  return envolvidos
    .filter((e) => e.polo === 'ATIVO' || e.polo === 'PASSIVO')
    .map((e, index) => ({
      name: e.nome,
      document: e.cpf ?? e.cnpj ?? null,
      polo: e.polo === 'ATIVO' ? ('ativo' as const) : ('passivo' as const),
      party_type: e.tipo_normalizado ?? e.tipo ?? null,
      position: index,
    }))
}

function firstPartyName(envolvidos: BpEnvolvido[], polo: 'ATIVO' | 'PASSIVO'): string | null {
  return envolvidos.find((e) => e.polo === polo)?.nome ?? null
}

/** `valor_causa.valor` é string decimal ("50000.0000"), não number. */
function toNumber(value: string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** A API descreve a situação em texto livre; o banco aceita três valores. */
function mapStatus(situacao: string | null | undefined, arquivado: boolean | null | undefined) {
  if (arquivado) return 'arquivado' as const
  if (!situacao) return null
  const s = situacao.toLowerCase()
  if (s.includes('arquiv') || s.includes('baix')) return 'arquivado' as const
  if (s.includes('suspen')) return 'suspenso' as const
  if (s.includes('ativo') || s.includes('andamento')) return 'ativo' as const
  return null
}

/** 'dd/MM/yyyy' ou ISO → 'yyyy-MM-dd', que é o formato da coluna date. */
function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function toLookupResult(processo: BpProcessoCapa): CnjLookupResult {
  const fonte = primaryFonte(processo.fontes ?? [])
  const capa = fonte?.capa ?? null
  const envolvidos = fonte?.envolvidos ?? []

  return {
    cnj_number: processo.numero_cnj ?? processo.numeroCnj ?? '',
    court: fonte?.tribunal?.sigla ?? fonte?.tribunal?.nome ?? fonte?.sigla ?? null,
    court_division: capa?.orgao_julgador ?? null,
    plaintiff: firstPartyName(envolvidos, 'ATIVO') ?? processo.titulo_polo_ativo ?? null,
    defendant: firstPartyName(envolvidos, 'PASSIVO') ?? processo.titulo_polo_passivo ?? null,
    subject: capa?.assunto ?? null,

    // A descrição da última movimentação exige `GET .../movimentacoes`, que é
    // uma consulta cobrada à parte. Nenhuma tela consome `last_movement` hoje,
    // então não gastamos crédito por ela; a data vem de graça na capa.
    last_movement: null,
    last_movement_date: toIsoDate(processo.data_ultima_movimentacao),

    procedural_class: capa?.classe ?? null,
    case_value: toNumber(processo.valor_causa?.valor ?? capa?.valor_causa?.valor),
    filing_date: toIsoDate(capa?.data_distribuicao ?? processo.data_inicio),
    status: mapStatus(capa?.situacao, processo.fontes_tribunais_estao_arquivadas),
    parties: mapParties(envolvidos),
  }
}
