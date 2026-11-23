'use client'

import { createClient } from '@/lib/supabase/client'
import type { ClientMessageInput } from '@/schemas/clientMessage.schema'
import {
  EMAIL_MESSAGE_LIST_COLUMNS,
  type EmailMessageContent,
  type EmailMessageSummary,
  type EmailMessageWithSender,
} from '@/types/emailMessage.types'

/**
 * Os e-mails mandados a clientes, vistos pelo escritório.
 *
 * Leitura direto pelo Supabase, com a RLS da migration 95 decidindo o que cada
 * perfil vê (o e-mail de cobrança exige `financeiro:view`). Envio sempre pela
 * rota: `email_messages` não tem policy de escrita, e a chave do Resend só
 * existe no servidor.
 */

const supabase = createClient()

const LIST_WITH_SENDER = `${EMAIL_MESSAGE_LIST_COLUMNS}, sender:profiles!email_messages_sent_by_fkey(full_name)`

/** O histórico de um cliente. 100 cobre anos de uso normal; o resumo diário
 * (PR 2) é o que mais vai somar, e mesmo ele é um por dia com novidade. */
const CLIENT_HISTORY_LIMIT = 100

export async function getClientEmailMessages(clientId: string): Promise<EmailMessageWithSender[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select(LIST_WITH_SENDER)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(CLIENT_HISTORY_LIMIT)

  if (error) throw error
  return (data ?? []) as unknown as EmailMessageWithSender[]
}

/** Os e-mails de uma cobrança: o link, os lembretes e a confirmação. A RLS
 * pede `financeiro:view` (migration 95). */
export async function getChargeEmailMessages(chargeId: string): Promise<EmailMessageWithSender[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select(LIST_WITH_SENDER)
    .eq('payment_charge_id', chargeId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data ?? []) as unknown as EmailMessageWithSender[]
}

/** O servidor consegue mandar e-mail? Só o booleano (`/api/email/status`). */
export async function getEmailConfigured(): Promise<boolean> {
  const response = await fetch('/api/email/status')
  if (!response.ok) return false
  const body = (await response.json().catch(() => null)) as { configured?: unknown } | null
  return body?.configured === true
}

/** Os últimos de todos os clientes — a lista de Configurações → E-mail. */
export async function getRecentEmailMessages(limit = 20): Promise<EmailMessageWithSender[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select(LIST_WITH_SENDER)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as EmailMessageWithSender[]
}

/** O conteúdo exato que saiu, buscado só quando alguém abre o e-mail. */
export async function getEmailMessageContent(id: string): Promise<EmailMessageContent> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('id, html, text_body')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as EmailMessageContent
}

/** A recusa da rota com a mensagem dela; a linha, quando chegou a existir
 * (endereço bloqueado, falha do Resend), vai junto para a tela invalidar. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly record: EmailMessageSummary | null,
  ) {
    super(message)
    this.name = 'EmailSendError'
  }
}

async function postSend(url: string, fallback: string): Promise<EmailMessageSummary> {
  const response = await fetch(url, { method: 'POST' })
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
    message?: EmailMessageSummary | null
  } | null

  if (!response.ok) {
    throw new EmailSendError(
      typeof body?.error === 'string' ? body.error : fallback,
      body?.message ?? null,
    )
  }
  if (!body?.message) throw new EmailSendError(fallback, null)
  return body.message
}

export function sendPortalLinkEmail(clientId: string): Promise<EmailMessageSummary> {
  return postSend(
    `/api/clientes/${clientId}/portal-link/email`,
    'Não foi possível enviar o link por e-mail.',
  )
}

/** Como a mensagem avulsa vai chegar — monta no servidor, não grava nada. */
export interface ClientMessagePreview {
  to: string
  subject: string
  html: string
}

export async function previewClientMessage(
  clientId: string,
  input: ClientMessageInput,
): Promise<ClientMessagePreview> {
  const response = await fetch(`/api/clientes/${clientId}/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, preview: true }),
  })
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
    preview?: ClientMessagePreview
  } | null
  if (!response.ok || !body?.preview) {
    throw new EmailSendError(
      typeof body?.error === 'string' ? body.error : 'Não foi possível montar a prévia.',
      null,
    )
  }
  return body.preview
}

export async function sendClientMessage(
  clientId: string,
  input: ClientMessageInput,
): Promise<EmailMessageSummary> {
  const response = await fetch(`/api/clientes/${clientId}/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, preview: false }),
  })
  const body = (await response.json().catch(() => null)) as {
    error?: unknown
    message?: EmailMessageSummary | null
  } | null
  if (!response.ok || !body?.message) {
    throw new EmailSendError(
      typeof body?.error === 'string' ? body.error : 'Não foi possível enviar a mensagem.',
      body?.message ?? null,
    )
  }
  return body.message
}

export function sendChargeLinkEmail(chargeId: string): Promise<EmailMessageSummary> {
  return postSend(
    `/api/financeiro/cobrancas/${chargeId}/email`,
    'Não foi possível enviar o link de pagamento por e-mail.',
  )
}

export function sendTestEmail(): Promise<EmailMessageSummary> {
  return postSend('/api/email/teste', 'Não foi possível enviar o e-mail de teste.')
}
