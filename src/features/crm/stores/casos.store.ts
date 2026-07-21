'use client'

import { create } from 'zustand'

interface CrmUiState {
  selectedCaseId: string | null
  modalOpen: boolean
  createModalOpen: boolean
  openModal: (caseId: string) => void
  closeModal: () => void
  openCreateModal: () => void
  closeCreateModal: () => void
}

export const useCrmUiStore = create<CrmUiState>((set) => ({
  selectedCaseId: null,
  modalOpen: false,
  createModalOpen: false,

  openModal: (caseId: string) =>
    set({ selectedCaseId: caseId, modalOpen: true }),

  closeModal: () =>
    set({ modalOpen: false, selectedCaseId: null }),

  openCreateModal: () =>
    set({ createModalOpen: true }),

  closeCreateModal: () =>
    set({ createModalOpen: false }),
}))

// Re-export old name for backward compatibility during refactor
export const useCrmCasosStore = useCrmUiStore
