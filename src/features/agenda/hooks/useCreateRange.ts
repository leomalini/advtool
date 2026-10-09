'use client'

import { useEffect, useRef, useState } from 'react'
import { createRange, type MinuteRange } from '../utils/dragMove'
import { suppressNextClick } from '../utils/suppressNextClick'

/** Quanto o mouse anda antes de um clique virar uma faixa — o mesmo do dnd-kit. */
const DRAG_THRESHOLD_PX = 5

interface UseCreateRangeOptions {
  /** Topo da coluna na tela agora — lido a cada movimento, a grade pode rolar. */
  getTop: () => number
  hourHeight: number
  /** Ausente: arrastar no vazio não faz nada, e o clique segue normal. */
  onSelect?: (range: MinuteRange) => void
}

/**
 * Arrastar no vazio de uma coluna da grade desenha uma faixa de horário; soltar
 * entrega a faixa para criar um evento nela.
 *
 * Eventos nativos, não dnd-kit: não há item sendo movido nem alvo onde soltar —
 * só uma faixa dentro da própria coluna. Um clique sem arrastar não é tocado: o
 * `onClick` do horário continua criando às HH:00.
 */
export function useCreateRange({ getTop, hourHeight, onSelect }: UseCreateRangeOptions) {
  const [range, setRange] = useState<MinuteRange | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // A coluna pode sumir no meio da faixa (troca de semana pelo teclado).
  useEffect(() => () => cleanupRef.current?.(), [])

  function handleMouseDown(event: React.MouseEvent) {
    if (!onSelect || event.button !== 0) return

    const minuteAt = (clientY: number) => ((clientY - getTop()) / hourHeight) * 60
    const anchorMin = minuteAt(event.clientY)
    const startY = event.clientY
    let current: MinuteRange | null = null

    const handleMove = (moveEvent: MouseEvent) => {
      if (!current && Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return
      current = createRange(anchorMin, minuteAt(moveEvent.clientY))
      setRange(current)
    }
    const handleUp = () => {
      cleanup()
      setRange(null)
      // Clique simples: segue para o `onClick` do horário.
      if (!current) return
      suppressNextClick()
      onSelect(current)
    }
    const cleanup = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      cleanupRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    cleanupRef.current = cleanup
  }

  return { range, handleMouseDown }
}
