'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { EMAIL_KIND_LABELS, type EmailMessageWithSender } from '@/types/emailMessage.types'
import { EmailStatusBadge } from './EmailStatusBadge'

interface EmailMessageListProps {
  messages: EmailMessageWithSender[]
  onOpen: (message: EmailMessageWithSender) => void
  /** Na lista geral (Configurações), cada linha leva à ficha do cliente. */
  linkToClient?: boolean
}

/**
 * Os e-mails, do mais recente: quando, status, tipo, assunto, para quem e
 * quem mandou. Clicar abre o e-mail como saiu.
 *
 * "Enviado" é aceito pelo Resend; "Entregue" só aparece quando o aviso do
 * servidor do destinatário chega pelo webhook.
 */
export function EmailMessageList({ messages, onOpen, linkToClient = false }: EmailMessageListProps) {
  return (
    <ul className="divide-y rounded-lg border">
      {messages.map((message) => (
        <li key={message.id}>
          <button
            type="button"
            onClick={() => onOpen(message)}
            className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
          >
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs tabular-nums text-muted-foreground">
                {format(parseISO(message.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </span>
              <EmailStatusBadge status={message.status} />
              <span className="text-xs text-muted-foreground">{EMAIL_KIND_LABELS[message.kind]}</span>
              {message.sandbox_to && (
                <span
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  title={`Desviado para ${message.sandbox_to}: o destinatário não recebeu.`}
                >
                  Teste
                </span>
              )}
            </span>
            <span className="text-sm font-medium">{message.subject}</span>
            <span className="text-xs text-muted-foreground">
              Para {message.to_address}
              {message.sandbox_to ? ` (foi para ${message.sandbox_to})` : ''} ·{' '}
              {message.sender?.full_name ?? 'Automático'}
            </span>
            {message.error && (
              <span className="text-xs text-destructive">{message.error}</span>
            )}
          </button>
          {linkToClient && message.client_id && (
            <Link
              href={`/clientes/${message.client_id}`}
              className="block px-3 pb-2.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Abrir a ficha do cliente
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
