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

// ── Resumo diário (migration 96) ─────────────────────────────────────────────

/** Por que um cliente não pode receber o resumo. A rota confere todos, e a
 * tela mostra cada um com o que fazer. */
export type DigestBlocker =
  | 'email_not_configured'
  | 'not_client'
  | 'no_email'
  | 'suppressed'
  | 'no_portal_link'
  | 'portal_link_unrecoverable'

export const DIGEST_BLOCKER_LABELS: Record<DigestBlocker, string> = {
  email_not_configured: 'O envio de e-mail não está configurado (Configurações → E-mail).',
  not_client: 'Só clientes recebem o resumo.',
  no_email: 'O cadastro não tem um e-mail válido.',
  suppressed: 'O e-mail do cadastro está bloqueado: recusou um envio ou marcou spam.',
  no_portal_link: 'O cliente não tem link de acompanhamento ativo — o resumo leva a ele.',
  portal_link_unrecoverable:
    'O link de acompanhamento atual não pode ser recuperado para envio. Gere um novo.',
}

/** A situação do resumo de um cliente, como a ficha mostra. */
export interface DigestSubscription {
  enabledAt: string | null
  /** O próprio cliente pediu para sair (link do e-mail). */
  optedOutAt: string | null
  /** Para onde o resumo vai — a mesma regra do envio. */
  recipient: string | null
  /** Vazio = pode receber. */
  blockers: DigestBlocker[]
}

/** A prévia (e o resultado) de ligar o resumo para o recorte da lista. */
export interface DigestBulkSummary {
  /** Clientes no recorte (busca + área). */
  total: number
  /** O recorte passou do teto de uma leitura e foi cortado. */
  truncated: boolean
  alreadyEnabled: number
  optedOut: number
  /** Os que seriam (ou foram) ligados agora. */
  eligible: number
  blocked: Partial<Record<DigestBlocker, number>>
  /** Só depois de confirmar: quantos foram de fato ligados. */
  enabled?: number
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
