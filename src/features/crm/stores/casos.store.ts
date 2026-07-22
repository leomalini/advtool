'use client'

import { create } from 'zustand'

interface CrmUiState {
  selectedCaseId: string | null
  modalOpen: boolean
  createModalOpen: boolean
  createForColumnId: string | null
  openModal: (caseId: string) => void
  closeModal: () => void
  openCreateModal: (columnId?: string) => void
  closeCreateModal: () => void
}

export const useCrmUiStore = create<CrmUiState>((set) => ({
  selectedCaseId: null,
  modalOpen: false,
  createModalOpen: false,
  createForColumnId: null,

  openModal: (caseId: string) =>
    set({ selectedCaseId: caseId, modalOpen: true }),

  closeModal: () =>
    set({ modalOpen: false, selectedCaseId: null }),

  openCreateModal: (columnId?: string) =>
    set({ createModalOpen: true, createForColumnId: columnId ?? null }),

  closeCreateModal: () =>
    set({ createModalOpen: false, createForColumnId: null }),
}))

// Re-export old name for backward compatibility during refactor
export const useCrmCasosStore = useCrmUiStore
