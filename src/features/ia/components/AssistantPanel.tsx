'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { History, Loader2, Maximize2, Plus, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePermissions } from '@/hooks/usePermissions'
import { buildScreenContext } from '../context/screenContext'
import { conversationKeys, useConversationMessages } from '../hooks/useConversations'
import { useAssistantPanelStore } from '../stores/assistantPanel.store'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'

/** O /ia já é o chat: lá o painel não abre. */
export function isAssistantPage(pathname: string): boolean {
  return pathname === '/ia' || pathname.startsWith('/ia/')
}

/** ⌘J no Mac, Ctrl+J no resto. O ⌘K já é a busca do Header. */
function isPanelShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === 'j' &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey
  )
}

/**
 * O painel lateral do Assistente (fase 4a): o mesmo chat do /ia, as mesmas
 * conversas, em qualquer tela do app. Cada pergunta leva a tela de onde saiu
 * (ver `useAssistantScreen`).
 *
 * Montado no layout do app, ao lado da coluna do conteúdo: em tela larga
 * ocupa a direita e o conteúdo encolhe; em tela menor, fica por cima.
 */
export function AssistantPanel() {
  const pathname = usePathname()
  const { can, isLoading } = usePermissions()
  const open = useAssistantPanelStore((state) => state.open)
  const toggle = useAssistantPanelStore((state) => state.toggle)
  const conversationId = useAssistantPanelStore((state) => state.conversation.id)

  const allowed = !isLoading && can('ia', 'view')
  const onAssistantPage = isAssistantPage(pathname)

  // Monta na primeira abertura e fica montado: fechar só esconde, e a conversa
  // (até uma resposta ainda chegando) sobrevive ao fechar e reabrir. Ajuste
  // durante o render, como em `IaContent`.
  const [started, setStarted] = useState(open)
  if (open && !started) setStarted(true)

  useEffect(() => {
    if (!allowed || onAssistantPage) return
    function onKeyDown(event: KeyboardEvent) {
      if (!isPanelShortcut(event)) return
      // No Chrome, Ctrl+J abriria os downloads.
      event.preventDefault()
      toggle()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [allowed, onAssistantPage, toggle])

  if (!allowed || onAssistantPage || !started) return null

  return (
    <aside
      aria-label="Assistente"
      className={cn(
        'fixed inset-y-0 right-0 z-40 w-full flex-col border-l bg-background shadow-xl',
        'sm:w-[420px] xl:static xl:z-auto xl:shadow-none',
        open ? 'flex' : 'hidden',
      )}
    >
      <PanelHeader />
      {/* Remonta ao trocar de conversa: o useChat guarda estado por id. */}
      <PanelChat key={conversationId} pathname={pathname} />
    </aside>
  )
}

function PanelHeader() {
  const [historyOpen, setHistoryOpen] = useState(false)
  const conversationId = useAssistantPanelStore((state) => state.conversation.id)
  const setOpen = useAssistantPanelStore((state) => state.setOpen)
  const selectConversation = useAssistantPanelStore((state) => state.selectConversation)
  const startNewConversation = useAssistantPanelStore((state) => state.startNewConversation)

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
      <Sparkles className="h-4 w-4 text-primary" />
      <h2 className="ml-1 flex-1 text-sm font-semibold">Assistente</h2>

      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Conversas">
            <History className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="h-80 w-72 p-0">
          <ConversationList
            activeId={conversationId}
            onSelect={(id) => {
              selectConversation(id)
              setHistoryOpen(false)
            }}
            onNew={() => {
              startNewConversation()
              setHistoryOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Nova conversa"
        title="Nova conversa"
        onClick={startNewConversation}
      >
        <Plus className="h-4 w-4" />
      </Button>

      {/* Conversa que ainda não tem turno também abre: o /ia mostra vazia e
          grava com o mesmo id na primeira pergunta. */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        asChild
        title="Abrir no Assistente em tela cheia"
      >
        <Link
          href={`/ia?conversa=${conversationId}`}
          aria-label="Abrir em tela cheia"
          onClick={() => setOpen(false)}
        >
          <Maximize2 className="h-4 w-4" />
        </Link>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Fechar o Assistente"
        title="Fechar (Ctrl+J)"
        onClick={() => setOpen(false)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

function PanelChat({ pathname }: { pathname: string }) {
  const queryClient = useQueryClient()
  const conversation = useAssistantPanelStore((state) => state.conversation)
  const screens = useAssistantPanelStore((state) => state.screens)
  const markConversationSaved = useAssistantPanelStore((state) => state.markConversationSaved)

  // Decidido ao montar: conversa já gravada vem do banco; a que nasceu aqui
  // segue só em memória, mesmo depois do primeiro turno (buscar de novo faria
  // o chat piscar).
  const [loadsHistory] = useState(() => !conversation.isNew)
  const { data: history, isLoading } = useConversationMessages(conversation.id, loadsHistory)

  const screenContext = useMemo(
    () => buildScreenContext(pathname, screens.map((screen) => screen.registration)),
    [pathname, screens],
  )

  // A conversa passou a existir (ou mudou de posição na lista do /ia).
  const handleTurnEnd = useCallback(() => {
    markConversationSaved(conversation.id)
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all })
  }, [conversation.id, markConversationSaved, queryClient])

  if (loadsHistory && isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1">
      <ChatPanel
        conversationId={conversation.id}
        initialMessages={history ?? []}
        onTurnEnd={handleTurnEnd}
        screenContext={screenContext}
        variant="panel"
      />
    </div>
  )
}
