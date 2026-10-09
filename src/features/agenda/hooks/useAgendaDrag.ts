'use client'

import { createContext, useContext } from 'react'
import type { AgendaItem } from '../utils/agendaItem'

/** A sombra do arraste na grade de horas: onde o item vai cair. */
export interface AgendaDragPreview {
  item: AgendaItem
  /** yyyy-MM-dd da coluna de destino. */
  dayKey: string
  topMin: number
  heightMin: number
  /** "14:15 – 15:15" */
  label: string
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
