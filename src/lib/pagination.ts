/**
 * Paginação das listagens (docs/paginacao.md).
 *
 * Toda listagem pagina, e todas do mesmo jeito: tamanho 25 / 50 / 100, página e
 * tamanho na URL. No código a página é um ÍNDICE (começa em 0); só a URL e a
 * tela mostram o número humano (começa em 1).
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 50

/** Nomes na URL, em português como os do Financeiro (`periodo`, `de`, `ate`). */
export const PAGE_PARAM = 'pagina'
export const PAGE_SIZE_PARAM = 'por_pagina'

/** Uma página vinda do servidor. */
export interface PageResult<T> {
  rows: T[]
  /** Total que casa o filtro, do `count: 'exact'` — não o tamanho de `rows`. */
  total: number
}

export function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
}

/** `por_pagina` da URL. Qualquer coisa fora das opções cai no padrão (`null`). */
export function parsePageSize(value: string | null): PageSize | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null
  const size = Number(value)
  return isPageSize(size) ? size : null
}

/** `pagina` da URL (começa em 1) → índice (começa em 0). Inválido → `null`. */
export function parsePageIndex(value: string | null): number | null {
  if (!value || !/^\d{1,6}$/.test(value)) return null
  const page = Number(value)
  return page >= 1 ? page - 1 : null
}

/** Nunca menos de 1: uma lista vazia ainda está "na página 1 de 1". */
export function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** Os índices inclusivos que o `.range()` do PostgREST espera. */
export function getPageRange(pageIndex: number, pageSize: number): { from: number; to: number } {
  const from = pageIndex * pageSize
  return { from, to: from + pageSize - 1 }
}

/** Para as telas que carregam a lista inteira e só fatiam a exibição. */
export function slicePage<T>(rows: readonly T[], pageIndex: number, pageSize: number): T[] {
  const { from } = getPageRange(pageIndex, pageSize)
  return rows.slice(from, from + pageSize)
}

/**
 * O PostgREST responde 416 (`PGRST103`) quando a página pedida começa depois
 * do total — uma URL antiga, ou linhas que sumiram desde o último carregamento.
 * Não é falha da tela: o serviço devolve a página vazia com o total certo, e a
 * paginação corrige a página para a última.
 */
export function isRangeNotSatisfiable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST103'
}

export type PageItem = { kind: 'page'; index: number } | { kind: 'gap'; key: 'start' | 'end' }

/** Com até este número de páginas, todas aparecem e não há reticências. */
const MAX_PLAIN_PAGES = 7

/**
 * Os botões da navegação: sempre a primeira e a última, a atual com uma de cada
 * lado, e reticências no meio — `1 … 4 5 6 … 12`.
 *
 * São sempre 7 posições (quando há mais de 7 páginas), então a barra não muda
 * de largura e o botão de "próxima" não foge do cursor a cada clique. Uma
 * reticência que esconderia uma página só vira o número dela: `1 2 3 4 5 … 12`,
 * nunca `1 … 3 4 5 … 12`.
 */
export function getPageItems(currentIndex: number, pageCount: number): PageItem[] {
  const page = (index: number): PageItem => ({ kind: 'page', index })

  if (pageCount <= MAX_PLAIN_PAGES) {
    return Array.from({ length: pageCount }, (_, index) => page(index))
  }

  const last = pageCount - 1
  // A janela de 3 páginas em volta da atual, empurrada para dentro nas pontas
  // para que as 7 posições fiquem sempre preenchidas.
  const windowStart = Math.max(Math.min(currentIndex - 1, last - 4), 2)
  const windowEnd = Math.min(Math.max(currentIndex + 1, 4), last - 2)

  const items: PageItem[] = [page(0)]
  items.push(windowStart > 2 ? { kind: 'gap', key: 'start' } : page(1))
  for (let index = windowStart; index <= windowEnd; index++) items.push(page(index))
  items.push(windowEnd < last - 2 ? { kind: 'gap', key: 'end' } : page(last - 1))
  items.push(page(last))
  return items
}
