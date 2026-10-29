'use client'

import { useEffect, useId } from 'react'
import type { ScreenRegistration } from '../context/screenContext'
import { useAssistantPanelStore } from '../stores/assistantPanel.store'

/**
 * Uma tela conta ao painel do Assistente o que está aberto nela (o registro,
 * com id e rótulo) e os filtros visíveis. Vale enquanto o componente estiver
 * montado; `null` retira, por exemplo enquanto o registro ainda carrega.
 *
 * Quem chama passa um objeto novo a cada render. A comparação é pelo conteúdo,
 * para não registrar de novo à toa.
 */
export function useAssistantScreen(registration: ScreenRegistration | null): void {
  const key = useId()
  const registerScreen = useAssistantPanelStore((state) => state.registerScreen)
  const unregisterScreen = useAssistantPanelStore((state) => state.unregisterScreen)
  const serialized = registration ? JSON.stringify(registration) : null

  useEffect(() => {
    if (serialized === null) {
      unregisterScreen(key)
      return
    }
    registerScreen(key, JSON.parse(serialized) as ScreenRegistration)
  }, [key, serialized, registerScreen, unregisterScreen])

  useEffect(() => () => unregisterScreen(key), [key, unregisterScreen])
}
