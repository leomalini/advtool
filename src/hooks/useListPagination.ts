'use client'

import { useState, useSyncExternalStore, type RefObject } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  getPageCount,
  parsePageIndex,
  parsePageSize,
  type PageSize,
} from '@/lib/pagination'
import type { MirroredParams } from './useSearchParamsMirror'

const STORAGE_PREFIX = 'advtool.page-size.'

const storageListeners = new Set<() => void>()

function subscribeToStoredPageSize(onChange: () => void): () => void {
  storageListeners.add(onChange)
  // Outra aba mudou o tamanho: esta acompanha.
  window.addEventListener('storage', onChange)
  return () => {
    storageListeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** `localStorage` pode lançar (aba privada, armazenamento bloqueado): o
 * tamanho só deixa de ser lembrado, a tela funciona igual. */
function readStoredPageSize(listKey: string): PageSize {
  try {
    return parsePageSize(window.localStorage.getItem(STORAGE_PREFIX + listKey)) ?? DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

function writeStoredPageSize(listKey: string, size: PageSize): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + listKey, String(size))
  } catch {
    // Sem armazenamento: vale só para esta visita.
  }
  storageListeners.forEach((listener) => listener())
}

/**
 * O tamanho lembrado para uma listagem. `useSyncExternalStore` porque o
 * `localStorage` só existe no navegador: o servidor e a hidratação veem o
 * padrão, e o valor salvo entra logo depois, sem quebrar a hidratação.
 */
function useStoredPageSize(listKey: string): PageSize {
  return useSyncExternalStore(
    subscribeToStoredPageSize,
    () => readStoredPageSize(listKey),
    () => DEFAULT_PAGE_SIZE,
  )
}

interface UseListPaginationOptions {
  /** Identifica a listagem para lembrar o tamanho: 'movimentacoes', 'processos'… */
  listKey: string
  /**
   * Filtros e ordem serializados. Quando mudam, a lista volta à página 1: a
   * página 4 de um recorte não tem relação com a página 4 do próximo.
   */
  resetKey: string
  /** O contêiner com scroll da lista: volta ao topo a cada troca de página. */
  scrollContainerRef?: RefObject<HTMLElement | null>
}

export interface ListPagination {
  pageIndex: number
  pageSize: PageSize
  setPageIndex: (index: number) => void
  setPageSize: (size: PageSize) => void
  /**
   * Página além do fim (URL antiga, exclusões): vai para a última que existe,
   * em vez de mostrar uma lista vazia. Chame no corpo do componente, DEPOIS da
   * consulta — a página alimenta a consulta e o total sai dela, então o ajuste
   * não cabe dentro deste hook.
   *
   * `total` é o do recorte ATUAL, ou `undefined` enquanto ele não chegou: o
   * total de um `placeholderData` é do recorte anterior.
   */
  clampToTotal: (total: number | undefined) => void
  /** `pagina` e `por_pagina` para `useSearchParamsMirror`. Ficam fora da URL
   * quando estão no padrão (página 1, 50 por página). */
  urlParams: MirroredParams
}

/**
 * Página e tamanho de uma listagem (docs/paginacao.md).
 *
 * Lê `pagina`/`por_pagina` da URL uma vez, ao montar — é o que faz voltar do
 * detalhe cair na mesma página. Sem `por_pagina`, vale o tamanho lembrado no
 * navegador para esta listagem.
 */
export function useListPagination({
  listKey,
  resetKey,
  scrollContainerRef,
}: UseListPaginationOptions): ListPagination {
  const searchParams = useSearchParams()
  const [initialUrl] = useState(() => ({
    pageIndex: parsePageIndex(searchParams.get(PAGE_PARAM)) ?? 0,
    pageSize: parsePageSize(searchParams.get(PAGE_SIZE_PARAM)),
  }))

  const [pageIndex, setPageIndexState] = useState(initialUrl.pageIndex)
  const [chosenSize, setChosenSize] = useState<PageSize | null>(initialUrl.pageSize)
  const storedSize = useStoredPageSize(listKey)
  const pageSize = chosenSize ?? storedSize

  // Ajustes DURANTE O RENDER, e não num efeito — o padrão que a doc do React
  // indica para "adaptar estado quando um valor muda". Num `useEffect`, a
  // consulta da página velha sairia antes do ajuste.
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setPageIndexState(0)
  }

  // Ajuste durante o render, como o de cima — por isso só pode ser chamado do
  // corpo do componente dono deste estado.
  function clampToTotal(total: number | undefined) {
    if (total === undefined) return
    const lastIndex = getPageCount(total, pageSize) - 1
    if (pageIndex > lastIndex) setPageIndexState(lastIndex)
  }

  function scrollToTop() {
    scrollContainerRef?.current?.scrollTo({ top: 0 })
  }

  function setPageIndex(index: number) {
    setPageIndexState(Math.max(0, index))
    scrollToTop()
  }

  function setPageSize(size: PageSize) {
    setChosenSize(size)
    writeStoredPageSize(listKey, size)
    setPageIndexState(0)
    scrollToTop()
  }

  return {
    pageIndex,
    pageSize,
    setPageIndex,
    setPageSize,
    clampToTotal,
    urlParams: {
      [PAGE_PARAM]: pageIndex > 0 ? String(pageIndex + 1) : null,
      [PAGE_SIZE_PARAM]: pageSize !== DEFAULT_PAGE_SIZE ? String(pageSize) : null,
    },
  }
}
