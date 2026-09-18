'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { conversationKeys, useConversationMessages } from '../hooks/useConversations'
import { ChatPanel } from './ChatPanel'
import { ConversationList } from './ConversationList'

interface ActiveConversation {
  id: string
  /** Nova = ainda não tem histórico no banco para carregar. Continua `true`
   * depois do primeiro turno enquanto a tela estiver aberta: o chat em
   * memória já é o histórico, e recarregar do banco só faria piscar. */
  isNew: boolean
}

function newConversation(): ActiveConversation {
  // Conversa nova nasce com um uuid gerado aqui; a rota faz o upsert no
  // primeiro turno. Assim o `useChat` não precisa trocar de id no meio.
  return { id: crypto.randomUUID(), isNew: true }
}

export function IaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const fromUrl = searchParams.get('conversa')

  const [active, setActive] = useState<ActiveConversation>(() =>
    fromUrl ? { id: fromUrl, isNew: false } : newConversation(),
  )

  // A URL manda quando muda por fora (voltar/avançar do navegador, link do
  // menu). Ajuste durante o render, não em efeito: evita um frame com a
  // conversa errada.
  const [lastUrl, setLastUrl] = useState(fromUrl)
  if (fromUrl !== lastUrl) {
    setLastUrl(fromUrl)
    if (fromUrl && fromUrl !== active.id) setActive({ id: fromUrl, isNew: false })
    if (!fromUrl && !active.isNew) setActive(newConversation())
  }

  const { data: history, isLoading } = useConversationMessages(active.id, !active.isNew)

  const select = useCallback(
    (id: string) => {
      setActive({ id, isNew: false })
      router.replace(`/ia?conversa=${id}`)
    },
    [router],
  )

  const startNew = useCallback(() => {
    setActive(newConversation())
    router.replace('/ia')
  }, [router])

  const handleTurnEnd = useCallback(() => {
    // A conversa passou a existir (ou mudou de posição na lista).
    queryClient.invalidateQueries({ queryKey: conversationKeys.all })
    if (fromUrl !== active.id) router.replace(`/ia?conversa=${active.id}`)
  }, [active.id, fromUrl, queryClient, router])

  return (
    <div className="flex h-full min-h-0 -m-6 border-t">
      <aside className="w-64 shrink-0 border-r bg-muted/30 hidden md:block">
        <ConversationList activeId={active.id} onSelect={select} onNew={startNew} />
      </aside>
      <section className="flex-1 min-w-0">
        {!active.isNew && isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ChatPanel
            // Remontar ao trocar de conversa: o useChat guarda estado por id.
            key={active.id}
            conversationId={active.id}
            initialMessages={history ?? []}
            onTurnEnd={handleTurnEnd}
          />
        )}
      </section>
    </div>
  )
}
