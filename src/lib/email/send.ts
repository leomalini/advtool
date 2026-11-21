// Server-side. O único caminho do app até o Resend. O client vem de quem chama:
// a service_role da rota, DEPOIS de `requirePermissionApi` — `email_messages`
// não tem policy de escrita (migration 95).
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import {
  EMAIL_MESSAGE_LIST_COLUMNS,
  EMAIL_SUPPRESSION_REASON_LABELS,
  type EmailKind,
  type EmailMessageSummary,
  type EmailResource,
  type EmailSuppressionReason,
} from '@/types/emailMessage.types'
import { getEmailConfig, type EmailConfig } from './config'
import { isEmailAddress, normalizeEmailAddress } from './address'
import type { OfficeIdentity } from './office'
import type { RenderedEmail } from './render'

/** Violação de índice único: a `dedupe_key` de um envio automático repetido. */
const UNIQUE_VIOLATION = '23505'

/** Tag que o Resend devolve no webhook. Serve para achar a linha mesmo quando
 * a resposta do envio se perdeu (timeout depois de o Resend aceitar), e a
 * linha ficou sem `provider_message_id`. */
export const MESSAGE_ID_TAG = 'advtool_id'

export interface SendEmailInput {
  kind: EmailKind
  resource: EmailResource
  clientId?: string | null
  paymentChargeId?: string | null
  /** O destinatário pretendido. Com `EMAIL_SANDBOX_TO`, vai para lá. */
  to: string
  subject: string
  content: RenderedEmail
  /** Assinatura no remetente e Reply-To. */
  office: OfficeIdentity
  /** Quem pediu; null = automático. */
  sentBy: string | null
  /** Só nos automáticos: o mesmo envio não sai duas vezes. */
  dedupeKey?: string | null
  /**
   * Segredos que vão no e-mail mas NÃO na cópia guardada. É o token do portal:
   * `docs/portal-cliente.md` garante que um vazamento só do banco (dump,
   * backup) não entrega link utilizável — o token mora como hash e cifrado.
   * Gravar o HTML com a URL em claro desfaria isso. A cópia guardada fica
   * idêntica ao que saiu, menos o segredo.
   */
  redactions?: { secret: string; replacement: string }[]
  /** Cabeçalhos extras — o `List-Unsubscribe` do resumo diário. */
  headers?: Record<string, string>
}

/** O texto com cada segredo trocado pela máscara. `split/join` troca todas as
 * ocorrências sem interpretar o segredo como expressão regular. */
function redact(value: string, redactions: SendEmailInput['redactions']): string {
  return (redactions ?? []).reduce(
    (text, { secret, replacement }) => (secret ? text.split(secret).join(replacement) : text),
    value,
  )
}

export type SendEmailResult =
  | { ok: true; message: EmailMessageSummary }
  | {
      ok: false
      /** Para a rota responder com o código certo. */
      status: number
      error: string
      /** A linha, quando ela chegou a existir (bloqueio, falha do Resend). */
      message: EmailMessageSummary | null
    }

function failure(status: number, error: string, message: EmailMessageSummary | null = null) {
  return { ok: false as const, status, error, message }
}

/**
 * Nome entre aspas, sem o que quebraria o cabeçalho: aspas, sinais de menor e
 * maior e quebra de linha. Sem nome, só o endereço.
 */
function fromHeader(name: string | null, address: string): string {
  const safe = name?.replace(/["<>\r\n]/g, '').trim()
  return safe ? `"${safe}" <${address}>` : address
}

/** Assunto que mostra, na caixa de teste, para quem o e-mail ia. */
function sandboxSubject(subject: string, intendedTo: string): string {
  return `[teste → ${intendedTo}] ${subject}`
}

async function findSuppression(
  supabase: SupabaseClient,
  addresses: string[],
): Promise<{ address: string; reason: EmailSuppressionReason } | null> {
  const { data, error } = await supabase
    .from('email_suppressions')
    .select('address, reason')
    .in('address', addresses)
    .limit(1)

  // Sem conseguir conferir, NÃO envia: mandar de novo para quem marcou spam é
  // o que derruba a reputação do domínio inteiro.
  if (error) throw new Error(`Bloqueios não conferidos: ${error.message}`)
  const row = data?.[0] as { address: string; reason: EmailSuppressionReason } | undefined
  return row ?? null
}

/**
 * Grava o desfecho do envio — só se a linha ainda estiver `queued`.
 *
 * O webhook pode chegar ANTES da resposta do envio (o Resend avisa em
 * segundos) e achar a linha pela tag: aí ela já está `sent` ou `delivered`, e
 * gravar por cima desfaria a informação mais nova. Sem linha em `queued`, vale
 * o que está no banco.
 */
async function settleMessage(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<EmailMessageSummary | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .update(patch)
    .eq('id', id)
    .eq('status', 'queued')
    .select(EMAIL_MESSAGE_LIST_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[email] linha não atualizada:', id, error.message)
    return null
  }
  if (data) return data as unknown as EmailMessageSummary

  const { data: current, error: readError } = await supabase
    .from('email_messages')
    .select(EMAIL_MESSAGE_LIST_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    console.error('[email] linha não relida:', id, readError.message)
    return null
  }
  return (current as unknown as EmailMessageSummary | null) ?? null
}

/** O webhook confirmou que o e-mail saiu, mesmo que a resposta do envio tenha
 * se perdido: o desfecho é sucesso, não falha. */
const LEFT_THE_BUILDING: EmailMessageSummary['status'][] = ['sent', 'delivered', 'delayed']

/**
 * Manda um e-mail e deixa o registro em `email_messages`.
 *
 * A ordem importa:
 *   1. sem configuração, nada é gravado — não houve tentativa;
 *   2. endereço bloqueado vira linha `suppressed` e não sai;
 *   3. a linha nasce `queued` ANTES da chamada (padrão de `payment_charges`):
 *      se a função morrer no meio, o histórico mostra que o envio foi pedido;
 *   4. o id da linha vai como `Idempotency-Key`: um retry depois de timeout
 *      não vira dois e-mails;
 *   5. a resposta vira `sent` (com o id do Resend) ou `failed` (com o motivo).
 *
 * "Enviado" quer dizer aceito pelo Resend. Entregue, recusado ou spam chegam
 * depois, pelo webhook (`/api/webhooks/resend`).
 */
export async function sendEmail(
  supabase: SupabaseClient,
  input: SendEmailInput,
  config: EmailConfig | null = getEmailConfig(),
): Promise<SendEmailResult> {
  if (!config) {
    return failure(503, 'O envio de e-mail não está configurado no servidor (ver Configurações → E-mail).')
  }

  const to = input.to.trim()
  if (!isEmailAddress(to)) return failure(422, `"${to}" não é um endereço de e-mail.`)

  const deliverTo = config.sandboxTo ?? to
  const subject = config.sandboxTo ? sandboxSubject(input.subject, to) : input.subject

  const baseRow = {
    kind: input.kind,
    resource: input.resource,
    client_id: input.clientId ?? null,
    payment_charge_id: input.paymentChargeId ?? null,
    to_address: to,
    sandbox_to: config.sandboxTo,
    subject,
    html: redact(input.content.html, input.redactions),
    text_body: redact(input.content.text, input.redactions),
    sent_by: input.sentBy,
    dedupe_key: input.dedupeKey ?? null,
  }

  let suppression: Awaited<ReturnType<typeof findSuppression>>
  try {
    suppression = await findSuppression(
      supabase,
      [...new Set([normalizeEmailAddress(to), normalizeEmailAddress(deliverTo)])],
    )
  } catch (error) {
    console.error('[email]', error instanceof Error ? error.message : error)
    return failure(500, 'Não foi possível conferir se o endereço está bloqueado. Nada foi enviado.')
  }

  if (suppression) {
    const reason = `Endereço bloqueado: ${EMAIL_SUPPRESSION_REASON_LABELS[suppression.reason]}.`
    const { data, error } = await supabase
      .from('email_messages')
      .insert({ ...baseRow, status: 'suppressed', error: reason })
      .select(EMAIL_MESSAGE_LIST_COLUMNS)
      .single()
    if (error) console.error('[email] bloqueio não registrado:', error.message)
    return failure(
      409,
      `${suppression.address} não recebe mais e-mails do escritório: ${EMAIL_SUPPRESSION_REASON_LABELS[suppression.reason]}.`,
      (data as unknown as EmailMessageSummary | null) ?? null,
    )
  }

  const { data: queued, error: queueError } = await supabase
    .from('email_messages')
    .insert({ ...baseRow, status: 'queued' })
    .select('id')
    .single()

  if (queueError || !queued) {
    if (queueError?.code === UNIQUE_VIOLATION) {
      return failure(409, 'Este e-mail já foi enviado.')
    }
    console.error('[email] linha não gravada:', queueError?.message)
    return failure(500, 'Não foi possível registrar o e-mail. Nada foi enviado.')
  }

  const id = queued.id as string
  const resend = new Resend(config.apiKey)

  let response: Awaited<ReturnType<typeof resend.emails.send>>
  try {
    response = await resend.emails.send(
      {
        from: fromHeader(input.office.name, config.fromAddress),
        to: [deliverTo],
        subject,
        html: input.content.html,
        text: input.content.text,
        ...(input.office.email ? { replyTo: input.office.email } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        tags: [
          { name: MESSAGE_ID_TAG, value: id },
          { name: 'kind', value: input.kind },
        ],
      },
      { idempotencyKey: id },
    )
  } catch (error) {
    // Rede caiu ou o SDK estourou. A linha fica `failed`; se o Resend chegou a
    // aceitar, o webhook acha a linha pela tag e corrige o status.
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[email] chamada ao Resend falhou:', detail)
    const message = await settleMessage(supabase, id, {
      status: 'failed',
      error: `Sem resposta do Resend: ${detail}`.slice(0, 1000),
    })
    if (message && LEFT_THE_BUILDING.includes(message.status)) return { ok: true, message }
    return failure(502, 'O serviço de e-mail não respondeu. Tente de novo em instantes.', message)
  }

  if (response.error || !response.data) {
    const detail = response.error?.message ?? 'resposta sem id'
    const message = await settleMessage(supabase, id, {
      status: 'failed',
      error: `Recusado pelo Resend: ${detail}`.slice(0, 1000),
    })
    return failure(502, `O serviço de e-mail recusou o envio: ${detail}`, message)
  }

  const message = await settleMessage(supabase, id, {
    status: 'sent',
    provider_message_id: response.data.id,
    sent_at: new Date().toISOString(),
  })

  // O e-mail saiu; só o registro do status ficou para trás. Não é falha de
  // envio — devolver erro aqui levaria alguém a mandar de novo.
  if (!message) {
    const now = new Date().toISOString()
    return {
      ok: true,
      message: {
        id,
        kind: baseRow.kind,
        resource: baseRow.resource,
        client_id: baseRow.client_id,
        to_address: baseRow.to_address,
        sandbox_to: baseRow.sandbox_to,
        subject: baseRow.subject,
        status: 'sent',
        error: null,
        sent_by: baseRow.sent_by,
        created_at: now,
        sent_at: now,
        delivered_at: null,
      },
    }
  }

  return { ok: true, message }
}
