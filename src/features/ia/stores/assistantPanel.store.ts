'use client'

import { create } from 'zustand'
import type { ScreenContext, ScreenRegistration } from '../context/screenContext'

/** Um pedido feito fora do painel (o botão da ficha da audiência). Leva o
 * contexto pronto: quem pediu fecha o modal, e o registro dele some da tela. */
export interface AssistantRequest {
  id: string
  prompt: string
  context: ScreenContext
}

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
  /** Pedido esperando o chat do painel ficar livre para enviar. */
  request: AssistantRequest | null
  setOpen: (open: boolean) => void
  toggle: () => void
  selectConversation: (id: string) => void
  startNewConversation: () => void
  /** Fim de um turno: a conversa já está no banco. */
  markConversationSaved: (id: string) => void
  registerScreen: (key: string, registration: ScreenRegistration) => void
  unregisterScreen: (key: string) => void
  /** Abre o painel e manda o pedido na conversa dele. */
  askAssistant: (prompt: string, context: ScreenContext) => void
  clearRequest: (id: string) => void
}

export const useAssistantPanelStore = create<AssistantPanelState>((set) => ({
  open: false,
  conversation: newConversation(),
  screens: [],
  request: null,

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

  askAssistant: (prompt, context) =>
    set({ open: true, request: { id: crypto.randomUUID(), prompt, context } }),
  clearRequest: (id) => set((state) => (state.request?.id === id ? { request: null } : state)),
}))
