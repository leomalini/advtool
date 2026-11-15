import type { MirroredParams } from '@/hooks/useSearchParamsMirror'
import { parseOneOf, type ParamReader } from '@/lib/urlParams'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { LegalArea } from '@/types/cliente.types'

/** Só na lista de Pessoas, que mostra todo mundo (migration 78). */
export type CadastroKindFilter = 'todas' | 'clientes' | 'pessoas'

export interface CadastroListFilters {
  area: LegalArea | null
  kind: CadastroKindFilter
}

/**
 * Os filtros das listas de Clientes e Pessoas na URL (docs/paginacao.md):
 *
 *     ?area=trabalhista
 *     ?tipo=clientes | tipo=pessoas      só em Pessoas
 *
 * A busca por texto fica FORA, como no Financeiro: é o nome ou o CPF de
 * alguém, e URLs acabam em logs.
 */
const PARAMS = { area: 'area', kind: 'tipo' } as const

const AREAS = Object.keys(AREAS_JURIDICAS) as LegalArea[]
const KINDS: readonly CadastroKindFilter[] = ['clientes', 'pessoas']

export function parseCadastroListFilters(params: ParamReader): CadastroListFilters {
  return {
    area: parseOneOf(params.get(PARAMS.area), AREAS),
    kind: parseOneOf(params.get(PARAMS.kind), KINDS) ?? 'todas',
  }
}

export function serializeCadastroListFilters(filters: CadastroListFilters): MirroredParams {
  return {
    [PARAMS.area]: filters.area,
    [PARAMS.kind]: filters.kind === 'todas' ? null : filters.kind,
  }
}

/** O filtro de tipo na forma da consulta: `null` = todos. */
export function isClientFilter(kind: CadastroKindFilter): boolean | null {
  if (kind === 'clientes') return true
  if (kind === 'pessoas') return false
  return null
}
