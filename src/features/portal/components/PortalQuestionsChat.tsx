'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mail, MessageCircleQuestion, Phone, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { PortalOfficeContact, PortalProcess } from '@/types/clientPortal.types'
import type { PortalVisibleAnswer } from '../answers/portalAnswersSchema'
import { isNeedsDocument, usePortalAnswers } from '../hooks/usePortal'

/** O que já foi escolhido na conversa. A resposta é guardada como estava ao ser
 * mostrada: se for refeita depois, o que já está na tela não muda de texto. */
type ChatEntry =
  | { id: string; kind: 'process'; label: string }
  | { id: string; kind: 'answer'; question: string; text: string }

function processHeading(processo: PortalProcess): string {
  return processo.title || processo.procedural_class || 'Processo'
}

/**
 * As perguntas fixas do portal (docs/assistente-claude.md, fase 3), em forma
 * de chat: um botão fixo abre a conversa, o cliente escolhe o processo e depois
 * a pergunta — sem abrir o processo na lista.
 *
 * Não se digita nada. As respostas já estão prontas no servidor: escolher o
 * processo busca as quatro de uma vez (gerando só se mudou o que a página
 * mostra), e escolher a pergunta só mostra o texto, sem chamar a IA.
 *
 * O estado mora aqui, fora do painel, para a conversa sobreviver a fechar e
 * abrir — o conteúdo do painel desmonta quando ele fecha. Com um processo só,
 * a escolha do processo é pulada.
 */
export function PortalQuestionsChat({
  token,
  processes,
  officeContact,
}: {
  token: string
  processes: PortalProcess[]
  officeContact: PortalOfficeContact | null
}) {
  const single = processes.length === 1
  const [open, setOpen] = useState(false)
  const [processId, setProcessId] = useState<string | null>(single ? processes[0].id : null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const current = processes.find((processo) => processo.id === processId) ?? null
  // Só busca com o painel aberto: a página carregar não prepara nada.
  const answers = usePortalAnswers(token, processId, open)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [entries, processId, answers.data, open])

  function chooseProcess(processo: PortalProcess) {
    setProcessId(processo.id)
    setEntries((list) => [
      ...list,
      { id: crypto.randomUUID(), kind: 'process', label: processHeading(processo) },
    ])
  }

  function chooseQuestion(answer: PortalVisibleAnswer) {
    setEntries((list) => [
      ...list,
      { id: crypto.randomUUID(), kind: 'answer', question: answer.label, text: answer.text },
    ])
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
                Escolha {single ? 'uma pergunta' : 'o processo e a pergunta'}: a resposta vem do
                andamento publicado nesta página.
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
            aria-live="polite"
            aria-label="Conversa de dúvidas"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            <AssistantBubble>
              <p>Olá! Explico o andamento dos seus processos em linguagem simples.</p>
              <p className="mt-2 text-muted-foreground">
                Não dou orientação jurídica: para decisões, prazos e urgências, fale com o
                escritório.
              </p>
            </AssistantBubble>

            {entries.map((entry) =>
              entry.kind === 'process' ? (
                <ClientBubble key={entry.id}>{entry.label}</ClientBubble>
              ) : (
                <div key={entry.id} className="space-y-4">
                  <ClientBubble>{entry.question}</ClientBubble>
                  <AssistantBubble>
                    <Paragraphs text={entry.text} />
                  </AssistantBubble>
                </div>
              )
            )}

            {current ? (
              <QuestionStep
                heading={processHeading(current)}
                single={single}
                answered={entries.at(-1)?.kind === 'answer'}
                query={answers}
                onPick={chooseQuestion}
                onChangeProcess={() => setProcessId(null)}
              />
            ) : (
              <ProcessStep processes={processes} onPick={chooseProcess} />
            )}

            <div ref={bottomRef} />
          </div>

          <div className="space-y-3 border-t p-4">
            {officeContact && <OfficeContactLine contact={officeContact} />}
            <p className="text-[11px] leading-snug text-muted-foreground">
              Respostas preparadas por inteligência artificial a partir das movimentações publicadas
              nesta página. Podem conter erros e não substituem a orientação do seu advogado.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ProcessStep({
  processes,
  onPick,
}: {
  processes: PortalProcess[]
  onPick: (processo: PortalProcess) => void
}) {
  return (
    <div className="space-y-2">
      <AssistantBubble>Sobre qual processo você quer saber?</AssistantBubble>
      <div className="flex flex-col items-start gap-2">
        {processes.map((processo) => (
          <OptionButton key={processo.id} onClick={() => onPick(processo)}>
            <span className="block">{processHeading(processo)}</span>
            {processo.cnj_number && (
              <span className="block font-mono text-[11px] text-muted-foreground">
                {processo.cnj_number}
              </span>
            )}
          </OptionButton>
        ))}
      </div>
    </div>
  )
}

function QuestionStep({
  heading,
  single,
  answered,
  query,
  onPick,
  onChangeProcess,
}: {
  heading: string
  single: boolean
  /** Já respondeu algo: o convite muda de "o que" para "mais alguma coisa". */
  answered: boolean
  query: ReturnType<typeof usePortalAnswers>
  onPick: (answer: PortalVisibleAnswer) => void
  onChangeProcess: () => void
}) {
  const changeProcess = !single && (
    <OptionButton onClick={onChangeProcess} muted>
      Escolher outro processo
    </OptionButton>
  )

  if (query.isPending || query.data?.status === 'preparing') {
    return (
      <AssistantBubble>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Preparando as respostas sobre {single ? 'o seu processo' : heading}…
        </span>
      </AssistantBubble>
    )
  }

  if (isNeedsDocument(query.error)) {
    return (
      <AssistantBubble>
        Sua confirmação de documento expirou. Recarregue a página e confirme de novo.
      </AssistantBubble>
    )
  }

  // Desligado, teto do mês, falha ou tudo oculto pelo escritório.
  if (query.data?.status !== 'ready' || query.data.answers.length === 0) {
    return (
      <div className="space-y-2">
        <AssistantBubble>
          Não consegui preparar as respostas sobre este processo agora. Tente mais tarde ou fale
          com o escritório.
        </AssistantBubble>
        {changeProcess && <div className="flex flex-col items-start gap-2">{changeProcess}</div>}
      </div>
    )
  }

  const about = single ? 'o seu processo' : heading
  return (
    <div className="space-y-2">
      <AssistantBubble>
        {answered
          ? `Quer saber mais alguma coisa sobre ${about}?`
          : `O que você quer saber sobre ${about}?`}
      </AssistantBubble>
      <div className="flex flex-col items-start gap-2">
        {query.data.answers.map((answer) => (
          <OptionButton key={answer.key} onClick={() => onPick(answer)}>
            {answer.label}
          </OptionButton>
        ))}
        {changeProcess}
      </div>
    </div>
  )
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function ClientBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  )
}

function OptionButton({
  children,
  onClick,
  muted = false,
}: {
  children: React.ReactNode
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'max-w-[85%] rounded-2xl border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent',
        muted && 'border-dashed text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {text
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
    </div>
  )
}

/** O contato cadastrado pelo escritório — nunca um inventado. */
function OfficeContactLine({ contact }: { contact: PortalOfficeContact }) {
  const phone = contact.phone?.trim()
  const email = contact.email?.trim()

  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <p>Falar com o escritório{contact.name ? ` (${contact.name})` : ''}:</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <Phone className="size-3.5" aria-hidden />
            {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <Mail className="size-3.5" aria-hidden />
            {email}
          </a>
        )}
      </div>
    </div>
  )
}
