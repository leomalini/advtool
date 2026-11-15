import type { MirroredParams } from '@/hooks/useSearchParamsMirror'
import { parseOneOf, type ParamReader } from '@/lib/urlParams'
import {
  CONTRACT_KINDS,
  CONTRACT_SITUATION_LABELS,
  type ContractKind,
  type ContractSituation,
} from '@/types/contract.types'

/** "Em vigor" junta vigente e vencendo: os dois ainda valem, e o número do
 * topo não pode deixar de contar justamente o que está para vencer. */
export type ContractSituationFilter = ContractSituation | 'em_vigor'

export interface ContractListFilters {
  situation: ContractSituationFilter | null
  kind: ContractKind | null
}

/**
 * Os filtros da lista de Contratos na URL (docs/paginacao.md):
 *
 *     ?situacao=em_vigor   também os números do topo, que filtram ao clicar
 *     ?tipo=honorarios
 *
 * A busca por texto fica FORA, como no Financeiro: pode ser o nome de um
 * cliente, e URLs acabam em logs.
 */
const PARAMS = { situation: 'situacao', kind: 'tipo' } as const

const SITUATION_FILTERS: readonly ContractSituationFilter[] = [
  'em_vigor',
  ...(Object.keys(CONTRACT_SITUATION_LABELS) as ContractSituation[]),
]

/** Valor que não existe na lista cai no padrão (sem filtro), sem erro. */
export function parseContractListFilters(params: ParamReader): ContractListFilters {
  return {
    situation: parseOneOf(params.get(PARAMS.situation), SITUATION_FILTERS),
    kind: parseOneOf(params.get(PARAMS.kind), CONTRACT_KINDS),
  }
}

export function serializeContractListFilters(filters: ContractListFilters): MirroredParams {
  return {
    [PARAMS.situation]: filters.situation,
    [PARAMS.kind]: filters.kind,
  }
}
