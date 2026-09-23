'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart } from 'ai'
import { Loader2, MessageCircleQuestion, SendHorizonal, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MarkdownText } from '@/features/ia/components/MarkdownText'
import {
  PORTAL_ASSISTANT_MAX_QUESTION_CHARS,
  PORTAL_ASSISTANT_STREAM_ERRORS,
  type PortalAssistantRequest,
} from '@/types/clientPortal.types'
import type { PortalAssistantUIMessage } from '../assistant/tools'

/** Perguntas prontas para quem abre o chat sem saber o que perguntar. As de
 * vários processos se respondem pela lista, sem abrir a timeline de todos. */
function suggestionsFor(processCount: number): string[] {
  if (processCount > 1) {
    return [
      'Qual processo teve movimentação mais recente?',
      'O que significa a última movimentação do processo mais recente?',
      'Quais processos estão ativos?',
    ]
  }
  return [
    'O que aconteceu por último no meu processo?',
    'O que significa a última movimentação?',
    'Em que fase o processo está?',
  ]
}

function hasText(message: PortalAssistantUIMessage): boolean {
  return message.parts.some((part) => part.type === 'text' && part.text.trim() !== '')
}

function lastUserText(messages: PortalAssistantUIMessage[]): string {
  const last = messages.findLast((message) => message.role === 'user')
  if (!last) return ''
  return last.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
}

const STREAM_ERROR_MESSAGES: readonly string[] = Object.values(PORTAL_ASSISTANT_STREAM_ERRORS)

/**
 * O que dizer quando o turno falha.
 *
 * Recusa da rota (limite de uso, link revogado, cookie vencido) chega com o
 * corpo JSON como mensagem do erro, e falha no meio da resposta chega com o
 * texto que a rota escolheu — os dois já escritos para o cliente. Qualquer
 * outra coisa (rede, erro do navegador em inglês) vira a mensagem genérica: o
 * detalhe técnico não ajuda quem está do outro lado.
 */
function chatErrorMessage(error: Error): string {
  if (STREAM_ERROR_MESSAGES.includes(error.message)) return error.message

  try {
    const body: unknown = JSON.parse(error.message)
    if (body && typeof body === 'object') {
      if ('needs_document' in body) {
        return 'Sua confirmação de documento expirou. Recarregue a página e confirme de novo.'
      }
      if ('error' in body && typeof body.error === 'string') return body.error
    }
  } catch {
    // Não é JSON: a falha foi fora da rota.
  }
  return PORTAL_ASSISTANT_STREAM_ERRORS.generic
}

/**
 * O chat de dúvidas do portal — um botão fixo que abre a conversa num painel.
 *
 * Só existe depois do documento confirmado: a página só o monta no estado com
 * dados, e a rota exige o mesmo cookie das demais.
 *
 * O `useChat` mora aqui, fora do painel, para a conversa sobreviver a fechar e
 * abrir — o conteúdo do painel desmonta quando ele fecha. Recarregar a página
 * começa outra conversa; a anterior fica no registro do escritório.
 *
 * Cada envio leva só o texto da pergunta (`prepareSendMessagesRequest`): o
 * histórico que o modelo recebe é o gravado no servidor.
 */
export function PortalAssistant({ token, processCount }: { token: string; processCount: number }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Instância única: o useChat só lê o transport na criação.
  const [transport] = useState(
    () =>
      new DefaultChatTransport<PortalAssistantUIMessage>({
        api: `/api/portal/${encodeURIComponent(token)}/assistente`,
        credentials: 'same-origin',
        prepareSendMessagesRequest: ({ id, messages }) => {
          const body: PortalAssistantRequest = { conversationId: id, text: lastUserText(messages) }
          return { body }
        },
      })
  )

  const { messages, sendMessage, status, stop, error } = useChat<PortalAssistantUIMessage>({
    transport,
  })

  const busy = status === 'submitted' || status === 'streaming'
  const canSend = !busy && input.trim() !== ''

  const lastMessage = messages.at(-1)
  // O modelo consulta e raciocina antes de escrever: o pedido já saiu, mas não
  // há texto para mostrar. Sem o indicador, o painel parece travado.
  const waiting =
    status === 'submitted' ||
    (status === 'streaming' && (lastMessage?.role !== 'assistant' || !hasText(lastMessage)))
  const consulting =
    waiting &&
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some(
      (part) =>
        isToolUIPart(part) && (part.state === 'input-streaming' || part.state === 'input-available')
    )

  const visibleMessages = messages.filter(hasText)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, status, open])

  function submit(text: string) {
    const trimmed = text.trim()
    if (busy || !trimmed) return
    setInput('')
    void sendMessage({ text: trimmed })
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 gap-2 rounded-full px-5 shadow-lg"
      >
        <MessageCircleQuestion className="size-5" aria-hidden />
        Tirar dúvidas
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
            <div className="flex flex-col gap-1">
              <SheetTitle>Tire suas dúvidas</SheetTitle>
              <SheetDescription>
                Assistente virtual sobre o andamento publicado nesta página.
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar">
                <X className="size-4" aria-hidden />
              </Button>
            </SheetClose>
          </SheetHeader>

          <div
            role="log"
            aria-busy={busy}
            aria-label="Conversa com o assistente"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {visibleMessages.length === 0 && !busy && (
              <Welcome suggestions={suggestionsFor(processCount)} onPick={submit} />
            )}

            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                    message.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted'
                  )}
                >
                  <MessageText message={message} />
                </div>
              </div>
            ))}

            {waiting && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {consulting ? 'Consultando o andamento…' : 'Pensando…'}
                </div>
              </div>
            )}

            {error && !busy && (
              <p role="alert" className="text-center text-sm text-destructive">
                {chatErrorMessage(error)}
              </p>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            className="space-y-2 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault()
              submit(input)
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit(input)
                  }
                }}
                placeholder="Escreva sua dúvida…"
                aria-label="Sua pergunta"
                enterKeyHint="send"
                maxLength={PORTAL_ASSISTANT_MAX_QUESTION_CHARS}
                rows={1}
                className="max-h-32 min-h-11 resize-none"
                disabled={busy}
              />
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => void stop()}
                  aria-label="Parar a resposta"
                  className="size-11 shrink-0"
                >
                  <Square className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  aria-label="Enviar pergunta"
                  className="size-11 shrink-0"
                >
                  <SendHorizonal className="size-4" aria-hidden />
                </Button>
              )}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Respostas geradas por inteligência artificial. Podem conter erros e não substituem a
              orientação do seu advogado.
            </p>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * O primeiro contato: o que o assistente faz, o que não faz e o aviso de que
 * a conversa fica registrada — antes da primeira pergunta, e não depois.
 */
function Welcome({
  suggestions,
  onPick,
}: {
  suggestions: string[]
  onPick: (text: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <p className="font-medium">
          Olá! Posso explicar o andamento dos seus processos em linguagem simples.
        </p>
        <p className="mt-2 text-muted-foreground">
          Respondo com base nas movimentações publicadas nesta página. Não dou orientação
          jurídica nem falo em nome do seu advogado: para decisões, prazos e urgências, fale com
          o escritório.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          A conversa fica registrada pelo escritório, mas ninguém a acompanha em tempo real.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted-foreground">Sugestões</p>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-2xl border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Só o texto: as consultas da IA não aparecem para o cliente — o indicador
 * de "consultando" cobre o tempo em que elas acontecem. */
function MessageText({ message }: { message: PortalAssistantUIMessage }) {
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type !== 'text' || !part.text.trim()) return null
        // Parte de texto não tem id próprio. A posição é estável: `parts` só
        // cresce no fim, nunca reordena.
        const key = `text-${index}`
        // Só a IA escreve Markdown. O que o cliente digita aparece como
        // digitou, e sem links clicáveis em nenhum dos dois.
        if (message.role === 'assistant') {
          return <MarkdownText key={key} text={part.text} allowLinks={false} />
        }
        return (
          <p key={key} className="whitespace-pre-wrap break-words leading-relaxed">
            {part.text}
          </p>
        )
      })}
    </div>
  )
}
