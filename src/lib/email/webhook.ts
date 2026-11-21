// Server-side. O que um aviso do Resend muda em `email_messages`. O client é a
// service_role da rota do webhook, que não tem sessão.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EmailBouncedEvent,
  EmailComplainedEvent,
  EmailDeliveredEvent,
  EmailDeliveryDelayedEvent,
  EmailFailedEvent,
  EmailSentEvent,
  EmailSuppressedEvent,
  WebhookEventPayload,
} from 'resend'
import type { EmailResource, EmailStatus } from '@/types/emailMessage.types'
import type { WebhookEventDestination, WebhookEventStatus } from '@/types/webhookEvent.types'
import { normalizeEmailAddress } from './address'
import { MESSAGE_ID_TAG } from './send'

/** A linha que o aviso atualiza, com o que o aviso no sino precisa. */
interface MatchedMessage {
  id: string
  kind: string
  resource: EmailResource
  client_id: string | null
  subject: string
  status: EmailStatus
  sandbox_to: string | null
  sent_by: string | null
}

const MATCH_COLUMNS = 'id, kind, resource, client_id, subject, status, sandbox_to, sent_by'

export interface ResendEventOutcome {
  status: WebhookEventStatus
  reason: string | null
  destinations: WebhookEventDestination[]
  /** Para `webhook_events.is_test`: e-mail de teste ou desviado ao sandbox. */
  isTest: boolean
  /** Falha de banco: a rota responde 503 e o Resend reenvia. */
  error: string | null
}

/**
 * Cada evento leva o status a um valor, mas só a partir de certos valores.
 *
 * A ordem de chegada dos avisos não é garantida, e reentrega acontece. A
 * transição condicional (`.in('status', from)`) resolve as duas coisas: um
 * "entregue" atrasado não apaga um "recusado", e o mesmo "recusado" chegando
 * duas vezes não atualiza nada na segunda — nem gera um segundo aviso no sino.
 */
interface Transition {
  to: EmailStatus
  from: EmailStatus[]
}

/** Os eventos de entrega que mudam o status. Abertura e clique ficam
 * desligados no domínio (docs/emails-clientes.md); se chegarem, é porque
 * alguém os ligou no painel do Resend, e são ignorados. */
type TrackedEmailEvent =
  | EmailSentEvent
  | EmailDeliveredEvent
  | EmailDeliveryDelayedEvent
  | EmailBouncedEvent
  | EmailComplainedEvent
  | EmailFailedEvent
  | EmailSuppressedEvent

const TRANSITIONS: Record<TrackedEmailEvent['type'], Transition> = {
  // Reconciliação: a resposta do envio se perdeu, mas o Resend aceitou.
  'email.sent': { to: 'sent', from: ['queued', 'failed'] },
  'email.delivered': { to: 'delivered', from: ['queued', 'sent', 'delayed', 'failed'] },
  'email.delivery_delayed': { to: 'delayed', from: ['queued', 'sent'] },
  // Bounce pode chegar depois do "entregue" (recusa assíncrona do servidor).
  'email.bounced': { to: 'bounced', from: ['queued', 'sent', 'delayed', 'delivered', 'failed'] },
  // Spam é marcado depois de entregue, às vezes dias depois.
  'email.complained': {
    to: 'complained',
    from: ['queued', 'sent', 'delayed', 'delivered', 'bounced', 'failed'],
  },
  'email.failed': { to: 'failed', from: ['queued', 'sent', 'delayed'] },
  'email.suppressed': { to: 'suppressed', from: ['queued', 'sent', 'delayed', 'failed'] },
}

function isTrackedEmailEvent(event: WebhookEventPayload): event is TrackedEmailEvent {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, event.type)
}

async function findMessage(
  supabase: SupabaseClient,
  event: TrackedEmailEvent,
): Promise<MatchedMessage | null> {
  const { data } = event

  if (data.email_id) {
    const { data: byProvider, error } = await supabase
      .from('email_messages')
      .select(MATCH_COLUMNS)
      .eq('provider_message_id', data.email_id)
      .maybeSingle()
    if (error) throw new Error(`Busca por email_id falhou: ${error.message}`)
    if (byProvider) return byProvider as unknown as MatchedMessage
  }

  // A tag é o id da nossa linha. Só vale se tiver forma de UUID: o valor vem
  // do corpo, e um texto qualquer no filtro viraria erro de banco.
  const tagged = data.tags?.[MESSAGE_ID_TAG]
  if (tagged && /^[0-9a-f-]{36}$/i.test(tagged)) {
    const { data: byTag, error } = await supabase
      .from('email_messages')
      .select(MATCH_COLUMNS)
      .eq('id', tagged)
      .maybeSingle()
    if (error) throw new Error(`Busca pela tag falhou: ${error.message}`)
    if (byTag) return byTag as unknown as MatchedMessage
  }

  return null
}

/** O motivo legível que vai para `email_messages.error` e para o sino. */
function problemDetail(event: TrackedEmailEvent): string | null {
  switch (event.type) {
    case 'email.bounced':
      return `Recusado pelo servidor do destinatário (${event.data.bounce.type}): ${event.data.bounce.message}`
    case 'email.complained':
      return 'O destinatário marcou o e-mail como spam.'
    case 'email.failed':
      return `Não saiu: ${event.data.failed.reason}`
    case 'email.suppressed':
      return `O Resend bloqueou o envio: ${event.data.suppressed.message}`
    default:
      return null
  }
}

/** Bounce temporário (caixa cheia, servidor fora) não bloqueia o endereço. */
function suppressionReason(event: TrackedEmailEvent): 'bounce' | 'complaint' | 'provider' | null {
  if (event.type === 'email.bounced') {
    return event.data.bounce.type.toLowerCase() === 'permanent' ? 'bounce' : null
  }
  if (event.type === 'email.complained') return 'complaint'
  if (event.type === 'email.suppressed') return 'provider'
  return null
}

const NOTIFY_ON: EmailStatus[] = ['bounced', 'complained', 'suppressed']

const NOTIFICATION_TITLES: Partial<Record<EmailStatus, string>> = {
  bounced: 'E-mail recusado',
  complained: 'E-mail marcado como spam',
  suppressed: 'E-mail bloqueado',
}

export async function applyResendEvent(
  supabase: SupabaseClient,
  event: WebhookEventPayload,
): Promise<ResendEventOutcome> {
  const base: ResendEventOutcome = {
    status: 'ignored',
    reason: null,
    destinations: [],
    isTest: false,
    error: null,
  }

  if (!isTrackedEmailEvent(event)) {
    return { ...base, reason: `Evento sem tratamento: ${event.type}.` }
  }
  const transition = TRANSITIONS[event.type]

  let message: MatchedMessage | null
  try {
    message = await findMessage(supabase, event)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ...base, status: 'error', reason: 'Não foi possível procurar o e-mail.', error: detail }
  }

  if (!message) {
    return { ...base, status: 'unmatched', reason: 'Nenhum e-mail do app com este id.' }
  }

  const isTest = message.kind === 'test' || message.sandbox_to !== null
  const destination: WebhookEventDestination = {
    table: 'email_messages',
    id: message.id,
    action: 'updated',
    link: message.client_id ? `/clientes/${message.client_id}` : '/configuracoes?aba=email',
  }

  const detail = problemDetail(event)
  const patch: Record<string, unknown> = {
    status: transition.to,
    provider_message_id: event.data.email_id,
    // Sempre o motivo DESTE evento: uma linha que ficou `failed` por timeout e
    // depois foi confirmada não pode seguir mostrando o erro antigo ao lado de
    // "Entregue". Os CHECKs da migration 95 pedem motivo só em failed/suppressed,
    // e esses eventos o trazem.
    error: detail ? detail.slice(0, 1000) : null,
    ...(transition.to === 'delivered' ? { delivered_at: event.created_at } : {}),
    ...(transition.to === 'sent' ? { sent_at: event.created_at } : {}),
  }

  const { data: updated, error: updateError } = await supabase
    .from('email_messages')
    .update(patch)
    .eq('id', message.id)
    .in('status', transition.from)
    .select('id')

  if (updateError) {
    return {
      ...base,
      isTest,
      status: 'error',
      reason: 'Não foi possível atualizar o e-mail.',
      error: updateError.message,
    }
  }

  // O bloqueio vale para o endereço que recusou de fato — o do sandbox, num
  // teste —, não para o do cadastro: um teste não pode bloquear o cliente.
  const reason = suppressionReason(event)
  const bouncedAddress = event.data.to[0]
  if (reason && bouncedAddress) {
    const { error: suppressionError } = await supabase.from('email_suppressions').upsert(
      {
        address: normalizeEmailAddress(bouncedAddress),
        reason,
        source_message_id: message.id,
        detail: detail?.slice(0, 1000) ?? null,
      },
      { onConflict: 'address', ignoreDuplicates: true },
    )
    if (suppressionError) {
      return {
        ...base,
        isTest,
        status: 'error',
        reason: 'O endereço não pôde ser bloqueado.',
        error: suppressionError.message,
      }
    }
  }

  const changed = (updated?.length ?? 0) > 0
  if (!changed) {
    return {
      ...base,
      isTest,
      status: 'duplicate',
      reason: `O e-mail já estava como "${message.status}"; o aviso não muda nada.`,
      destinations: [{ ...destination, action: 'existing_source' }],
    }
  }

  if (NOTIFY_ON.includes(transition.to)) {
    await notifyUndelivered(supabase, message, transition.to, bouncedAddress ?? null, detail)
  }

  return { ...base, isTest, status: 'processed', destinations: [destination] }
}

/**
 * Aviso no sino. E-mail manual avisa só quem mandou (`recipient_id`, migration
 * 85) — é quem precisa conferir o endereço; automático avisa todos com o
 * recurso da linha. Best-effort, como os demais avisos: perder o aviso não
 * desfaz o status gravado.
 */
async function notifyUndelivered(
  supabase: SupabaseClient,
  message: MatchedMessage,
  status: EmailStatus,
  address: string | null,
  detail: string | null,
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    kind: 'email_undelivered',
    resource: message.resource,
    title: NOTIFICATION_TITLES[status] ?? 'E-mail não entregue',
    body: [message.subject, address, detail].filter(Boolean).join(' — ').slice(0, 500),
    link: message.client_id ? `/clientes/${message.client_id}` : '/configuracoes?aba=email',
    entity_type: 'email_message',
    entity_id: message.id,
    source: 'webhook',
    recipient_id: message.sent_by,
  })
  if (error) console.error('[email/webhook] aviso não gravado:', error.message)
}
