// Server-side only — usa a API key da BuscaProcessos.
import { searchProcessosByOab } from './client'
import { awaitPending, sleep } from './awaitPending'
import type {
  BpOabAdvogado,
  BpOabListingStatus,
  BpOabProcessoResumo,
  BpOabRef,
  BpOabSearchData,
} from './types'

/** A documentação aceita 50 ou 100; 100 é o maior. */
const PAGE_LIMIT = 100
/** Trava contra uma paginação que nunca termina — 200 páginas são 20 mil
 * processos, muito além do acervo de um advogado. */
const MAX_PAGES = 200
/** Limite documentado: 2 requisições/s por chave. */
const PAGE_INTERVAL_MS = 600

export interface OabListing {
  oab: BpOabRef
  status: BpOabListingStatus
  advogado: BpOabAdvogado | null
  /** Sem repetição de CNJ, sem o `raw` de cada item. */
  processes: BpOabProcessoResumo[]
  pages: number
  /** Soma de `meta.creditsCharged` — na prática, só a página 1 cobra. */
  creditsCharged: number
  /** `false` quando a própria API disse que a cobertura não está completa. */
  complete: boolean
  partialReason: string | null
  /** As páginas como vieram, para conferir a forma real da resposta. */
  rawPages: unknown[]
}

export interface ListOabOptions {
  onPage?: (page: number, found: number) => void
}

/**
 * Todos os processos de UMA inscrição, num recorte (`RECENTE` ou `HISTORICO`).
 *
 * Percorre as páginas seguindo `links.next`. Só a página 1 é cobrada, e por
 * isso ela nunca é repetida aqui: se a API disser que a cobertura ainda está
 * parcial, o resultado volta marcado como parcial em vez de consultar de novo
 * — a documentação pede para não fazer polling curto da página 1.
 */
export async function listOabProcesses(
  oab: BpOabRef,
  status: BpOabListingStatus,
  { onPage }: ListOabOptions = {},
): Promise<OabListing> {
  const byCnj = new Map<string, BpOabProcessoResumo>()
  const rawPages: unknown[] = []
  let advogado: BpOabAdvogado | null = null
  let creditsCharged = 0
  let complete = true
  let partialReason: string | null = null
  let page = 1
  let pages = 0

  while (page <= MAX_PAGES) {
    const { data, meta } = await awaitPending<BpOabSearchData>(() =>
      searchProcessosByOab({
        oab_estado: oab.estado,
        oab_numero: oab.numero,
        status,
        page,
        limit: PAGE_LIMIT,
      }),
    )

    pages++
    rawPages.push(data)
    creditsCharged += meta?.creditsCharged ?? 0
    advogado = advogado ?? data.advogado ?? null

    if (data.cobertura?.completa === false) {
      complete = false
      partialReason = data.cobertura.motivoParcial ?? partialReason
    }

    const items = data.processos ?? data.items ?? []
    for (const item of items) {
      if (!item.numeroCnj || byCnj.has(item.numeroCnj)) continue
      // `raw` repete o item inteiro: as páginas brutas já o guardam.
      const summary = { ...item }
      delete summary.raw
      byCnj.set(item.numeroCnj, summary)
    }
    onPage?.(page, byCnj.size)

    const next = nextPage(data, page, items.length)
    if (next === null) break
    page = next
    await sleep(PAGE_INTERVAL_MS)
  }

  return {
    oab,
    status,
    advogado,
    processes: [...byCnj.values()],
    pages,
    creditsCharged,
    complete,
    partialReason,
    rawPages,
  }
}

/**
 * A página seguinte, ou `null` quando acabou.
 *
 * `links.next` é o sinal documentado. A paginação numérica e a página cheia
 * ficam como reserva, caso a resposta real venha sem `links`.
 */
function nextPage(data: BpOabSearchData, page: number, itemCount: number): number | null {
  if (data.links) {
    const next = data.links.next
    if (!next) return null
    return typeof next.page === 'number' && next.page > page ? next.page : page + 1
  }

  const totalPages = data.pagination?.totalPages
  if (typeof totalPages === 'number') return page < totalPages ? page + 1 : null

  return itemCount >= PAGE_LIMIT ? page + 1 : null
}
