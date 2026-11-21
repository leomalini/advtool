'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { EmailMessageWithSender } from '@/types/emailMessage.types'
import { useClientEmailMessages } from '../hooks/useEmailMessages'
import { EmailMessageList } from './EmailMessageList'
import { EmailPreviewDialog } from './EmailPreviewDialog'
import { DigestSubscriptionCard } from './DigestSubscriptionCard'

/**
 * A aba E-mails da ficha do cliente: a chave do resumo diário e tudo o que o
 * escritório mandou para ele, com o status de entrega e o conteúdo como saiu.
 */
export function ClientEmailsTab({ clientId }: { clientId: string }) {
  return (
    <div className="space-y-5">
      <DigestSubscriptionCard clientId={clientId} />
      <EmailHistory clientId={clientId} />
    </div>
  )
}

function EmailHistory({ clientId }: { clientId: string }) {
  const { data: messages = [], isLoading, error } = useClientEmailMessages(clientId)
  const [opened, setOpened] = useState<EmailMessageWithSender | null>(null)

  if (isLoading) return <Skeleton className="h-32 w-full" />

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar os e-mails deste cliente.
      </p>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Mail className="h-8 w-8 opacity-40" />
        <p className="text-sm font-medium">Nenhum e-mail enviado a este cliente</p>
        <p className="text-xs">O link de acompanhamento pode ir por e-mail em “Link do cliente”.</p>
      </div>
    )
  }

  return (
    <>
      <EmailMessageList messages={messages} onOpen={setOpened} />
      <EmailPreviewDialog message={opened} onClose={() => setOpened(null)} />
    </>
  )
}
