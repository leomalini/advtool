'use client'

import { useState } from 'react'
import { Loader2, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { EmailMessageList } from '@/features/emails/components/EmailMessageList'
import { EmailPreviewDialog } from '@/features/emails/components/EmailPreviewDialog'
import { useRecentEmailMessages } from '@/features/emails/hooks/useEmailMessages'
import { useSendTestEmail } from '@/features/emails/hooks/useEmailMutations'
import type { EmailMessageWithSender, EmailSetupStatus } from '@/types/emailMessage.types'
import { useOfficeSettings } from '../hooks/useOfficeSettings'
import { StatusRow } from './StatusRow'

function Code({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-muted px-1 py-0.5">{children}</code>
}

/**
 * Configurações → E-mail: se o app consegue mandar e-mail ao cliente, de onde
 * sai, para onde vão as respostas, e os últimos envios.
 *
 * As credenciais ficam no ambiente, como as da D4Sign (docs/emails-clientes.md,
 * "Credenciais"): a aba mostra o que falta pelo nome da variável e não edita
 * nada. A prova de ponta a ponta é o e-mail de teste.
 */
export function EmailSettingsTab({ setup }: { setup: EmailSetupStatus }) {
  const { can } = usePermissions()
  const canManage = can('configuracoes', 'manage')
  const configured = setup.problems.length === 0

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-muted-foreground" />
            E-mail para clientes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            O envio sai pelo Resend, do domínio verificado do escritório. Cada e-mail fica
            registrado na ficha do cliente, com o conteúdo exato e o status de entrega.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConnectionStatus setup={setup} />
          {configured && <SandboxStatus setup={setup} />}
          {configured && <WebhookStatus setup={setup} />}
          <ReplyToStatus />
          {configured && canManage && <TestEmailButton sandboxTo={setup.sandboxTo} />}
        </CardContent>
      </Card>

      <RecentEmails />
    </div>
  )
}

function ConnectionStatus({ setup }: { setup: EmailSetupStatus }) {
  if (setup.problems.length > 0) {
    return (
      <StatusRow ok={false} title="Envio de e-mail não configurado">
        <ul className="list-disc space-y-0.5 pl-4">
          {setup.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className="mt-1">
          A chave sai do painel do Resend e vai para as variáveis de ambiente do servidor. O{' '}
          <Code>.env.example</Code> explica cada uma.
        </p>
      </StatusRow>
    )
  }

  return (
    <StatusRow ok title="Pronto para enviar">
      Remetente <Code>{setup.fromAddress}</Code>. O domínio dele precisa estar verificado no Resend
      — o e-mail de teste, abaixo, é a prova.
    </StatusRow>
  )
}

function SandboxStatus({ setup }: { setup: EmailSetupStatus }) {
  if (!setup.sandboxTo) {
    return (
      <StatusRow ok title="Envio real">
        Os e-mails vão para o endereço do cadastro de cada cliente.
      </StatusRow>
    )
  }

  return (
    <StatusRow ok={!setup.isProduction} title="Modo de teste">
      Todo e-mail vai para <Code>{setup.sandboxTo}</Code>, com o destinatário real no assunto.
      Nenhum cliente recebe nada.
      {setup.isProduction && (
        <> Isto é produção: tire <Code>EMAIL_SANDBOX_TO</Code> das variáveis para os clientes receberem.</>
      )}
    </StatusRow>
  )
}

function WebhookStatus({ setup }: { setup: EmailSetupStatus }) {
  if (!setup.webhookEndpoint) {
    return (
      <StatusRow ok={false} title="Sem endereço para os avisos de entrega">
        <Code>APP_PUBLIC_URL</Code> não aponta para um endereço HTTPS público. Os e-mails saem, mas
        ficam como “Enviado”: entregue, recusado e spam não chegam.
      </StatusRow>
    )
  }

  if (!setup.hasWebhookSecret) {
    return (
      <StatusRow ok={false} title="Os avisos de entrega seriam recusados">
        Falta <Code>RESEND_WEBHOOK_SECRET</Code>, o segredo do webhook cadastrado no Resend para{' '}
        <Code>{setup.webhookEndpoint}</Code>.
      </StatusRow>
    )
  }

  return (
    <StatusRow ok title="Avisos de entrega prontos">
      O Resend avisa em <Code>{setup.webhookEndpoint}</Code>: entregue, recusado, spam. Endereço que
      recusa ou marca spam deixa de receber.
    </StatusRow>
  )
}

/** Reply-To e nome vêm do cadastro do escritório (aba Geral). */
function ReplyToStatus() {
  const { data: settings, isLoading } = useOfficeSettings()
  if (isLoading) return <Skeleton className="h-10 w-full" />

  const name = settings?.name?.trim()
  const email = settings?.email?.trim()

  return (
    <StatusRow ok={Boolean(name && email)} title="Assinatura e respostas">
      {name ? (
        <>
          O cliente vê o remetente como <strong>{name}</strong>.{' '}
        </>
      ) : (
        'Sem nome do escritório, o remetente aparece só com o endereço. '
      )}
      {email ? (
        <>
          Quem responder escreve para <Code>{email}</Code>.
        </>
      ) : (
        'Sem e-mail do escritório, a resposta do cliente volta para o remetente automático, que ninguém lê. '
      )}
      {(!name || !email) && 'Preencha em Configurações → Geral → Escritório.'}
    </StatusRow>
  )
}

function TestEmailButton({ sandboxTo }: { sandboxTo: string | null }) {
  const sendTest = useSendTestEmail()

  async function handleSend() {
    try {
      const message = await sendTest.mutateAsync()
      toast.success(`E-mail de teste enviado para ${message.sandbox_to ?? message.to_address}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o teste.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <Button size="sm" variant="outline" onClick={handleSend} disabled={sendTest.isPending}>
        {sendTest.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="mr-1.5 h-3.5 w-3.5" />
        )}
        Enviar e-mail de teste
      </Button>
      <span className="text-xs text-muted-foreground">
        {sandboxTo ? `Vai para ${sandboxTo}.` : 'Vai para o e-mail da sua conta.'}
      </span>
    </div>
  )
}

function RecentEmails() {
  const { data: messages = [], isLoading, error } = useRecentEmailMessages()
  const [opened, setOpened] = useState<EmailMessageWithSender | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Últimos envios</CardTitle>
        <p className="text-xs text-muted-foreground">
          Os 20 mais recentes, de todos os clientes. Cobranças só aparecem para quem vê o
          Financeiro.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : error ? (
          // Lista vazia aqui afirmaria "nada foi enviado" sem ter conseguido
          // olhar — o caso mais provável é a migration 95 não aplicada.
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar os envios. Confira se a migration 95 (email_messages) foi
            aplicada.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum e-mail enviado ainda.</p>
        ) : (
          <EmailMessageList messages={messages} onOpen={setOpened} linkToClient />
        )}
      </CardContent>
      <EmailPreviewDialog message={opened} onClose={() => setOpened(null)} />
    </Card>
  )
}
