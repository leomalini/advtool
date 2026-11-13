'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/** Os parâmetros que uma tela controla: `null` tira o parâmetro da URL. */
export type MirroredParams = Readonly<Record<string, string | null>>

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
 */
export function useSearchParamsMirror(values: MirroredParams): void {
  const searchParams = useSearchParams()
  const current = searchParams.toString()
  const next = mergeSearchParams(current, values)

  useEffect(() => {
    if (next === current) return
    const { pathname } = window.location
    window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname)
  }, [next, current])
}
