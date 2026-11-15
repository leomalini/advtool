import type { MirroredParams } from '@/hooks/useSearchParamsMirror'

/**
 * Os filtros de Publicações na URL (docs/paginacao.md):
 *
 *     ?nao_lidas=0      mostra também as lidas (o padrão é só a fila de não lidas)
 *     ?sem_processo=1   só as de processo não cadastrado
 *
 * A busca por texto fica FORA, como no Financeiro: pode ser o nome de uma
 * parte, e URLs acabam em logs.
 */
const PARAMS = {
  onlyUnread: 'nao_lidas',
  onlyOrphans: 'sem_processo',
} as const

export interface PublicationListToggles {
  onlyUnread: boolean
  onlyOrphans: boolean
}

interface ParamReader {
  get(name: string): string | null
}

export function parsePublicationToggles(params: ParamReader): PublicationListToggles {
  return {
    onlyUnread: params.get(PARAMS.onlyUnread) !== '0',
    onlyOrphans: params.get(PARAMS.onlyOrphans) === '1',
  }
}

/** Só o que difere do padrão vai para a URL. */
export function serializePublicationToggles(toggles: PublicationListToggles): MirroredParams {
  return {
    [PARAMS.onlyUnread]: toggles.onlyUnread ? null : '0',
    [PARAMS.onlyOrphans]: toggles.onlyOrphans ? '1' : null,
  }
}
