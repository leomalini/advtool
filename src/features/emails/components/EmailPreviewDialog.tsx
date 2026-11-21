'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EMAIL_KIND_LABELS, type EmailMessageWithSender } from '@/types/emailMessage.types'
import { useEmailMessageContent } from '../hooks/useEmailMessages'
import { EmailStatusBadge } from './EmailStatusBadge'

interface EmailPreviewDialogProps {
  message: EmailMessageWithSender | null
  onClose: () => void
}

/**
 * O e-mail exatamente como saiu (`email_messages.html`).
 *
 * Num iframe com `sandbox` vazio: sem script, sem formulário, sem acesso à
 * sessão do app. O HTML foi gerado pelo próprio app, mas a mensagem avulsa
 * (PR 4) leva texto digitado — escapado na geração, e isolado aqui de novo.
 */
export function EmailPreviewDialog({ message, onClose }: EmailPreviewDialogProps) {
  const { data: content, isLoading, error } = useEmailMessageContent(message?.id ?? null)

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {message && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{message.subject}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <EmailStatusBadge status={message.status} />
                  <span>{EMAIL_KIND_LABELS[message.kind]}</span>
                  <span>
                    {format(parseISO(message.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <span>
                    Para {message.to_address}
                    {message.sandbox_to ? ` — desviado para ${message.sandbox_to}` : ''}
                  </span>
                </div>
              </DialogDescription>
            </DialogHeader>

            {message.error && <p className="text-sm text-destructive">{message.error}</p>}

            {isLoading ? (
              <Skeleton className="h-[60vh] w-full" />
            ) : error || !content ? (
              <p className="text-sm text-muted-foreground">Não foi possível carregar o conteúdo.</p>
            ) : (
              <iframe
                title={`Conteúdo do e-mail: ${message.subject}`}
                srcDoc={content.html}
                sandbox=""
                className="h-[60vh] w-full rounded-lg border bg-white"
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
