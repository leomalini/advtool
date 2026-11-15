'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'

/** Os parâmetros que uma tela controla: `null` tira o parâmetro da URL. */
export type MirroredParams = Readonly<Record<string, string | null>>

const LIST_QUERY_PREFIX = 'advtool.list-query.'

/**
 * Aplica `values` sobre a query atual e devolve a nova. Só toca nas chaves
 * informadas: o resto da URL (o `?create=1` de um modal, um `?cnj=` de quem
 * chegou por link) fica como estava.
 */
export function mergeSearchParams(current: string, values: MirroredParams): string {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(values)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  return params.toString()
}

/** `sessionStorage` pode lançar (armazenamento bloqueado): o link de volta só
 * deixa de lembrar a página, a tela funciona igual. */
function rememberListQuery(pathname: string, query: string): void {
  try {
    window.sessionStorage.setItem(LIST_QUERY_PREFIX + pathname, query)
  } catch {
    // Sem armazenamento: o "voltar para a lista" abre a lista no padrão.
  }
}

function readListQuery(pathname: string): string {
  try {
    return window.sessionStorage.getItem(LIST_QUERY_PREFIX + pathname) ?? ''
  } catch {
    return ''
  }
}

/**
 * Espelha o estado de uma listagem na URL — página, tamanho, filtros, ordem.
 *
 * O estado é a fonte da verdade e a URL só o reflete, como no Financeiro: o
 * Next aplica o `replaceState` ao `useSearchParams` dentro de uma transição, e
 * um campo guiado pela URL ficaria atrás da digitação. A tela lê a URL uma vez,
 * ao montar, e daí em diante só escreve nela.
 *
 * `replaceState`, e não `router.replace`: sem render no servidor e sem uma
 * entrada no histórico por clique — "voltar" sai da tela, não desfaz a página.
 * O Next integra o `replaceState` nativo ao `useSearchParams`
 * (docs: linking-and-navigating, "Native History API").
 *
 * A query também fica guardada na sessão do navegador, por caminho: é dela
 * que o link "voltar para a lista" de um detalhe (`useListHref`) reabre a
 * mesma página. O botão voltar do navegador não basta — o detalhe navega entre
 * registros (anterior/próxima) e empilha histórico.
 */
export function useSearchParamsMirror(values: MirroredParams): void {
  const searchParams = useSearchParams()
  const current = searchParams.toString()
  const next = mergeSearchParams(current, values)

  useEffect(() => {
    const { pathname } = window.location
    rememberListQuery(pathname, next)
    if (next === current) return
    window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname)
  }, [next, current])
}

/** Nunca notifica: a query guardada só muda enquanto a lista está aberta, e
 * quem lê é o detalhe, montado depois. */
const subscribeNever = () => () => {}

/**
 * O endereço da lista como a pessoa a deixou — página, tamanho, filtros —
 * para o "voltar para a lista" de uma tela de detalhe. Sem nada guardado (link
 * direto para o detalhe, outra aba), é a lista no padrão.
 *
 * O servidor e a hidratação veem o caminho puro; o guardado entra logo depois,
 * sem quebrar a hidratação.
 */
export function useListHref(listPath: string): string {
  const query = useSyncExternalStore(
    subscribeNever,
    () => readListQuery(listPath),
    () => '',
  )
  return query ? `${listPath}?${query}` : listPath
}
