'use client'

import { create } from 'zustand'
import { CASOS } from '@/data/mock'
import type { Caso } from '@/data/mock'

interface CrmCasosState {
  casos: Caso[]
  selectedCasoId: string | null
  modalOpen: boolean
  openModal: (caso: Caso) => void
  closeModal: () => void
  moveCaso: (casoId: string, novaColunaId: string) => void
}

export const useCrmCasosStore = create<CrmCasosState>((set) => ({
  casos: CASOS,
  selectedCasoId: null,
  modalOpen: false,

  openModal: (caso: Caso) =>
    set({ selectedCasoId: caso.id, modalOpen: true }),

  closeModal: () =>
    set({ modalOpen: false, selectedCasoId: null }),

  moveCaso: (casoId: string, novaColunaId: string) =>
    set((state) => ({
      casos: state.casos.map((c) =>
        c.id === casoId ? { ...c, colunaId: novaColunaId } : c
      ),
    })),
}))
