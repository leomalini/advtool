'use client'

import { useSyncExternalStore } from 'react'

/** Nunca notifica: o valor só muda uma vez, na transição servidor → cliente. */
const emptySubscribe = () => () => {}

/**
 * `false` no servidor e no primeiro render do cliente; `true` depois de montar.
 *
 * Serve para adiar qualquer marcação que dependa de estado que só existe no
 * browser — tema salvo no `localStorage`, `matchMedia`, largura da janela. O
 * `useTheme` do next-themes é o caso clássico: ele lê o `localStorage` já no
 * inicializador do `useState`, então o primeiro render do cliente conhece o tema
 * real enquanto o servidor só conhece o `defaultTheme`. Renderizar a partir daí
 * produz HTML diferente dos dois lados e quebra a hidratação.
 *
 * Usa `useSyncExternalStore` em vez de `useState` + `useEffect` porque o
 * snapshot do servidor é explícito (o terceiro argumento), o que é exatamente a
 * pergunta sendo feita — e evita o render extra que o efeito causaria.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}
