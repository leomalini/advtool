'use client'

import { create } from 'zustand'
import type { ScreenRegistration } from '../context/screenContext'

export interface ActiveConversation {
  id: string
  /** Nova = ainda não tem histórico no banco para carregar. Vira `false` no
   * fim do primeiro turno; o chat que já está na tela segue com o que tem em
   * memória, e só quem montar depois (o painel de volta do /ia) busca no banco. */
  isNew: boolean
}

function newConversation(): ActiveConversation {
  // A rota faz o upsert no primeiro turno, como no /ia.
  return { id: crypto.randomUUID(), isNew: true }
}

interface AssistantPanelState {
  open: boolean
  /** A conversa do painel. Fica aqui, fora do componente, para atravessar a
   * troca de tela e o fechar e reabrir do painel. */
  conversation: ActiveConversation
  /** O que cada tela montada informou, na ordem de montagem (a chave é o
   * `useId` de quem registrou). */
  screens: ReadonlyArray<{ key: string; registration: ScreenRegistration }>
  setOpen: (open: boolean) => void
  toggle: () => void
  selectConversation: (id: string) => void
  startNewConversation: () => void
  /** Fim de um turno: a conversa já está no banco. */
  markConversationSaved: (id: string) => void
  registerScreen: (key: string, registration: ScreenRegistration) => void
  unregisterScreen: (key: string) => void
}

export const useAssistantPanelStore = create<AssistantPanelState>((set) => ({
  open: false,
  conversation: newConversation(),
  screens: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),

  selectConversation: (id) =>
    set((state) =>
      state.conversation.id === id ? state : { conversation: { id, isNew: false } },
    ),
  startNewConversation: () => set({ conversation: newConversation() }),
  markConversationSaved: (id) =>
    set((state) =>
      state.conversation.id === id && state.conversation.isNew
        ? { conversation: { id, isNew: false } }
        : state,
    ),

  // Quem já registrou troca no lugar: a ordem de montagem é o que decide o
  // registro em foco, e um rótulo que muda não pode passar para a frente.
  registerScreen: (key, registration) =>
    set((state) => {
      const index = state.screens.findIndex((screen) => screen.key === key)
      if (index === -1) return { screens: [...state.screens, { key, registration }] }
      const screens = [...state.screens]
      screens[index] = { key, registration }
      return { screens }
    }),
  unregisterScreen: (key) =>
    set((state) =>
      state.screens.some((screen) => screen.key === key)
        ? { screens: state.screens.filter((screen) => screen.key !== key) }
        : state,
    ),
}))
