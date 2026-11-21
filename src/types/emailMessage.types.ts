/** Espelha `public.email_messages` e `public.email_suppressions` (migration 95). */

export const EMAIL_KINDS = [
  'process_digest',
  'portal_link',
  'payment_link',
  'payment_reminder',
  'payment_confirmed',
  'custom_message',
  'test',
] as const

export type EmailKind = (typeof EMAIL_KINDS)[number]

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  process_digest: 'Resumo dos processos',
  portal_link: 'Link de acompanhamento',
  payment_link: 'Link de pagamento',
  payment_reminder: 'Lembrete de pagamento',
  payment_confirmed: 'Pagamento recebido',
  custom_message: 'Mensagem do escritório',
  test: 'E-mail de teste',
}

/** Recurso do RBAC exigido para ver a linha — a policy lê esta coluna. */
export type EmailResource = 'clientes' | 'financeiro' | 'configuracoes'

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  queued: 'Na fila',
  sent: 'Enviado',
  delivered: 'Entregue',
  delayed: 'Entrega atrasada',
  bounced: 'Recusado',
  complained: 'Marcado como spam',
  failed: 'Não enviado',
  suppressed: 'Bloqueado',
}

/** Como a tela pinta cada status: sucesso, em andamento ou problema. */
export const EMAIL_STATUS_TONE: Record<EmailStatus, 'success' | 'pending' | 'problem'> = {
  queued: 'pending',
  sent: 'pending',
  delivered: 'success',
  delayed: 'pending',
  bounced: 'problem',
  complained: 'problem',
  failed: 'problem',
  suppressed: 'problem',
}

/** As colunas que as listas leem — sem `html` e `text_body`, que pesam e só
 * saem quando alguém abre o e-mail. */
export const EMAIL_MESSAGE_LIST_COLUMNS =
  'id, kind, resource, client_id, to_address, sandbox_to, subject, status, error, sent_by, created_at, sent_at, delivered_at'

export interface EmailMessageSummary {
  id: string
  kind: EmailKind
  resource: EmailResource
  client_id: string | null
  to_address: string
  /** Para onde foi de fato quando `EMAIL_SANDBOX_TO` desviou o envio. */
  sandbox_to: string | null
  subject: string
  status: EmailStatus
  error: string | null
  sent_by: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
}

export interface EmailMessageWithSender extends EmailMessageSummary {
  sender: { full_name: string } | null
}

export interface EmailMessageContent {
  id: string
  html: string
  text_body: string
}

export type EmailSuppressionReason = 'bounce' | 'complaint' | 'provider'

export const EMAIL_SUPPRESSION_REASON_LABELS: Record<EmailSuppressionReason, string> = {
  bounce: 'o servidor do destinatário recusou um e-mail',
  complaint: 'o destinatário marcou um e-mail como spam',
  provider: 'o Resend já tinha bloqueado o endereço',
}

/**
 * O que a aba E-mail de Configurações mostra, montado no servidor: nomes de
 * variáveis e endereços de remetente, nunca a chave.
 */
export interface EmailSetupStatus {
  /** O que impede o envio. Vazio = pronto para mandar. */
  problems: string[]
  /** `EMAIL_FROM`, quando válido. */
  fromAddress: string | null
  /** `EMAIL_SANDBOX_TO`: todo envio vai para cá. */
  sandboxTo: string | null
  /** O app roda no ambiente de produção da Vercel. */
  isProduction: boolean
  hasWebhookSecret: boolean
  /** Onde o Resend deve entregar os avisos; null sem `APP_PUBLIC_URL` HTTPS. */
  webhookEndpoint: string | null
}
