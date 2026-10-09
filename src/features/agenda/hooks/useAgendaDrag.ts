'use client'

import { createContext, useContext } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { AgendaItem } from '../utils/agendaItem'
import type { AgendaDragSource, ResizeDragSource } from '../utils/dragMove'

/** Onde o item vai cair. */
export type AgendaDragPreview =
  /** Sombra na grade de horas. */
  | {
      kind: 'grid'
      item: AgendaItem
      /** yyyy-MM-dd da coluna de destino. */
      dayKey: string
      topMin: number
      heightMin: number
      /** "14:15 – 15:15" */
      label: string
    }
  /** Células acesas no mês ou na faixa "Dia todo" — todos os dias que o item
   * vai ocupar, não só o do ponteiro. */
  | {
      kind: 'days'
      item: AgendaItem
      dayKeys: string[]
      /** Faixa "Dia todo" ou mês: as duas grades usam a mesma chave de dia, e
       * só a da área sob o ponteiro acende. */
      area: 'strip' | 'month'
    }

interface AgendaDragState {
  /** Item sendo movido — arrastado agora ou esperando a resposta de um diálogo.
   * Todos os pedaços dele ficam apagados, não só o que foi pego. */
  movingItemId: string | null
  preview: AgendaDragPreview | null
}

export const AgendaDragContext = createContext<AgendaDragState>({
  movingItemId: null,
  preview: null,
})

/** Estado do arraste para as grades. Fora do `AgendaDnd`, nada se move. */
export function useAgendaDrag(): AgendaDragState {
  return useContext(AgendaDragContext)
}

/**
 * Liga um item (bloco, chip do mês, chip da faixa) ao arraste.
 *
 * Um id por pedaço — o mesmo evento aparece em vários dias. O item fica no
 * lugar enquanto a sombra (ou o chip no overlay) mostra o destino; todos os
 * pedaços dele apagam juntos.
 */
export function useAgendaItemDrag(source: AgendaDragSource, draggable: boolean) {
  const { segment } = source
  const { setNodeRef, listeners } = useDraggable({
    id: `${segment.item.id}@${segment.dayKey}`,
    data: source,
    disabled: !draggable,
  })
  const { movingItemId } = useAgendaDrag()
  const dragClasses = cn(
    draggable && 'cursor-grab',
    movingItemId === segment.item.id && 'opacity-40'
  )
  return { setNodeRef, listeners, dragClasses }
}

/** Liga a alça de baixo de um bloco ao arraste — muda o término. */
export function useAgendaResizeDrag(source: ResizeDragSource) {
  const { setNodeRef, listeners } = useDraggable({
    id: `${source.segment.item.id}@${source.segment.dayKey}:fim`,
    data: source,
  })
  return { setNodeRef, listeners }
}

/** A célula `dayKey` da área `area` está acesa pelo arraste? */
export function isDayHighlighted(
  preview: AgendaDragPreview | null,
  area: 'strip' | 'month',
  dayKey: string
): boolean {
  return preview?.kind === 'days' && preview.area === area && preview.dayKeys.includes(dayKey)
}
