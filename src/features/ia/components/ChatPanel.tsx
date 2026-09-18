'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import { Loader2, Paperclip, SendHorizonal, Sparkles, Square } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AssistantUIMessage } from '../tools'
import { ACTION_TOOL_NAMES } from '../tools/actions'
import { AI_FILE_ACCEPT } from '../files/constants'
import { useChatAttachments } from '../hooks/useChatAttachments'
import { useExecuteAction, type PendingAction } from '../hooks/useExecuteAction'
import { hasVisibleContent } from '../utils/messageContent'
import { AttachmentChip } from './AttachmentChip'
import { MessageParts } from './MessageParts'

const SUGGESTIONS = [
  'Quais compromissos tenho esta semana?',
  'Quais tarefas estão atrasadas?',
  'Há publicações não lidas?',
  'Quais processos foram atualizados recentemente?',
]

/** Ação proposta que ainda espera Confirmar/Cancelar. Enquanto houver uma, o
 * histórico tem uma chamada de tool sem resultado — e a API recusa um pedido
 * novo nesse estado. */
function hasPendingAction(messages: AssistantUIMessage[]): boolean {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return false
  return last.parts.some(
    (part) =>
      isToolUIPart(part) &&
      (ACTION_TOOL_NAMES as string[]).includes(getToolName(part)) &&
      part.state === 'input-available',
  )
}

interface ChatPanelProps {
  conversationId: string
  initialMessages: AssistantUIMessage[]
  /** Fim de cada turno — a conversa já está gravada quando isto dispara. */
  onTurnEnd: () => void
}

export function ChatPanel({ conversationId, initialMessages, onTurnEnd }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [runningCallId, setRunningCallId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const executeAction = useExecuteAction()
  const attachments = useChatAttachments(conversationId)

  // Instância única: o useChat só lê o transport na criação.
  const [transport] = useState(
    () =>
      new DefaultChatTransport<AssistantUIMessage>({
        api: '/api/ia/chat',
        body: { conversationId },
      }),
  )

  const { messages, sendMessage, addToolOutput, status, stop, error } =
    useChat<AssistantUIMessage>({
      id: conversationId,
      messages: initialMessages,
      transport,
      // Depois que TODAS as ações do turno receberam resposta (confirmada ou
      // cancelada), o histórico volta ao servidor para o modelo concluir.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onFinish: () => onTurnEnd(),
      onError: (err) => console.error('[ia] chat error:', err),
    })

  const busy = status === 'submitted' || status === 'streaming'
  const pendingAction = hasPendingAction(messages)
  const inputLocked = busy || pendingAction
  const canSend =
    !inputLocked &&
    !attachments.isUploading &&
    (input.trim() !== '' || attachments.fileParts.length > 0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, status])

  function submit(text: string) {
    const trimmed = text.trim()
    const files = attachments.fileParts
    if (inputLocked || attachments.isUploading || (!trimmed && files.length === 0)) return
    setInput('')
    attachments.clear()
    void sendMessage({ text: trimmed, files: files.length > 0 ? files : undefined })
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0 || inputLocked) return
    attachments.add(Array.from(list))
  }

  async function handleConfirm(toolCallId: string, action: PendingAction) {
    setRunningCallId(toolCallId)
    try {
      const output = await executeAction.mutateAsync(action)
      toast.success('Ação confirmada.')
      void addToolOutput({ tool: action.tool, toolCallId, output })
    } catch (err) {
      // O service já lançou o erro do Supabase (RLS, validação…): a tela
      // avisa, e o modelo fica sabendo que não foi gravado.
      console.error('[ia] action failed:', err)
      toast.error('Não foi possível executar a ação.')
      void addToolOutput({
        tool: action.tool,
        toolCallId,
        output: { ok: false, motivo: 'falha ao gravar — o usuário já foi avisado na tela' },
      })
    } finally {
      setRunningCallId(null)
    }
  }

  function handleCancel(toolCallId: string, action: PendingAction) {
    void addToolOutput({
      tool: action.tool,
      toolCallId,
      output: { ok: false, motivo: 'cancelado pelo usuário' },
    })
  }

  const lastMessage = messages.at(-1)
  const lastMessageId = lastMessage?.id
  const visibleMessages = messages.filter(hasVisibleContent)
  // O modelo raciocina antes de escrever: o stream já começou, mas não há
  // nada para mostrar ainda. Sem o indicador, a tela parece travada.
  const thinking =
    status === 'submitted' ||
    (status === 'streaming' &&
      (lastMessage?.role !== 'assistant' || !hasVisibleContent(lastMessage)))

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 flex-col',
        isDragging && 'ring-2 ring-inset ring-primary/50',
      )}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        // Sair para um filho também dispara dragleave; só conta sair do painel.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        addFiles(event.dataTransfer.files)
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {visibleMessages.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Assistente do escritório</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Pergunte sobre clientes, processos, agenda, tarefas, publicações e financeiro,
                peça para criar uma tarefa ou compromisso — ou anexe um PDF, imagem, Word ou
                planilha para a IA ler.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {visibleMessages.map((message) => (
          <div
            key={message.id}
            className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted rounded-bl-sm',
              )}
            >
              <MessageParts
                message={message}
                streaming={busy && message.id === lastMessageId}
                runningCallId={runningCallId}
                onConfirmAction={handleConfirm}
                onCancelAction={handleCancel}
              />
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center">
            O assistente falhou ao responder. Tente de novo.
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingAction && (
        <p className="px-4 pb-1 text-xs text-muted-foreground">
          Confirme ou cancele a ação acima para continuar a conversa.
        </p>
      )}

      <form
        className="border-t p-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
      >
        {attachments.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.localId}
                fileName={attachment.file.name}
                status={attachment.status}
                onRemove={() => attachments.remove(attachment.localId)}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={AI_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              // Permite escolher o mesmo arquivo de novo depois de removê-lo.
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={inputLocked}
            aria-label="Anexar arquivo"
            title="Anexar PDF, imagem, Word, Excel, CSV ou TXT (até 25 MB)"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(input)
              }
            }}
            placeholder="Pergunte algo ou anexe um arquivo… (Enter envia, Shift+Enter quebra linha)"
            rows={1}
            className="min-h-[40px] max-h-40 resize-none"
            disabled={inputLocked}
          />
          {busy ? (
            <Button type="button" size="icon" variant="outline" onClick={stop} aria-label="Parar">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar">
              <SendHorizonal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
