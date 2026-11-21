// Server-side. Os e-mails de cobrança (docs/emails-clientes.md, "Cobrança"):
// o link de pagamento, o lembrete e a confirmação. O client é a service_role —
// das rotas, depois da permissão; do cron; ou da confirmação do pagamento, que
// não tem sessão.
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatCurrency } from '@/types/financialEntry.types'
import { describeCaptureMethod, type PaymentChargeStatus } from '@/types/paymentCharge.types'
import type { EmailStatus } from '@/types/emailMessage.types'
import { getClientGreetingName } from '@/types/cliente.types'
import { chunk } from '@/utils/chunk'
import { pickClientEmail, type ContactSource } from '@/utils/clientContacts'
import type { ChargeEmailData } from '@/emails/ChargeSummary'
import { PaymentLinkEmail, paymentLinkSubject } from '@/emails/PaymentLinkEmail'
import {
  PaymentReminderEmail,
  paymentReminderSubject,
  type PaymentReminderMoment,
} from '@/emails/PaymentReminderEmail'
import { PaymentConfirmedEmail, paymentConfirmedSubject } from '@/emails/PaymentConfirmedEmail'
import { getEmailConfig, type EmailConfig } from './config'
import { brazilDay, daysBetween, formatInstantDay, formatStoredDay } from './dates'
import { loadOfficeIdentity, type OfficeIdentity } from './office'
import { renderEmail } from './render'
import { sendEmail, type SendEmailResult } from './send'

// ── As regras ───────────────────────────────────────────────────────────────

/** Lembrete antes: o vencimento está a 1, 2 ou 3 dias. Janela, e não um dia
 * exato, para um cron que falhou um dia não perder o lembrete — a
 * `dedupe_key` garante um só. */
export const REMINDER_BEFORE_DAYS = { min: 1, max: 3 } as const

/** Lembrete depois: venceu há 1 a 7 dias. Depois disso é conversa, não e-mail
 * automático. */
export const REMINDER_OVERDUE_DAYS = { min: 1, max: 7 } as const

/** O link acabou de sair? Então o lembrete "antes" espera: receber o link e o
 * lembrete no mesmo dia é ruído. */
const REMINDER_MIN_HOURS_AFTER_LINK = 24

/**
 * O link "foi por e-mail" quando um envio dele saiu. É a regra única dos
 * automáticos de cobrança: lembrete e confirmação só existem para cobrança
 * cujo link o escritório mandou por e-mail — quem mandou pelo WhatsApp não vê
 * o cliente receber e-mail de cobrança do nada.
 */
const LINK_SENT_STATUSES: EmailStatus[] = ['sent', 'delivered', 'delayed']

const HOUR_MS = 60 * 60 * 1000

// ── Leitura ─────────────────────────────────────────────────────────────────

interface ChargeClient extends ContactSource {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

interface ChargeForEmail {
  id: string
  status: PaymentChargeStatus
  description: string
  amount_cents: number
  checkout_url: string | null
  entry: {
    type: 'receita' | 'despesa'
    status: 'pendente' | 'pago'
    due_date: string | null
    client: ChargeClient | null
  } | null
}

const CHARGE_FOR_EMAIL = `
  id, status, description, amount_cents, checkout_url,
  entry:financial_entries!payment_charges_financial_entry_id_fkey(
    type, status, due_date,
    client:clients!financial_entries_client_id_fkey(
      id, type, name, company_name, trade_name, email, phone,
      contacts:client_contacts(type, value, is_primary)
    )
  )
`

async function loadCharge(admin: SupabaseClient, chargeId: string): Promise<ChargeForEmail | null> {
  const { data, error } = await admin
    .from('payment_charges')
    .select(CHARGE_FOR_EMAIL)
    .eq('id', chargeId)
    .maybeSingle()
  if (error) throw new Error(`Cobrança não lida: ${error.message}`)
  return (data as unknown as ChargeForEmail | null) ?? null
}

function chargeData(charge: ChargeForEmail, amountCents = charge.amount_cents): ChargeEmailData {
  return {
    description: charge.description,
    amount: formatCurrency(amountCents / 100),
    dueDate: charge.entry?.due_date ? formatStoredDay(charge.entry.due_date) : null,
  }
}

/** As cobranças desta lista cujo link saiu por e-mail, com o primeiro envio. */
async function linkEmailedAt(
  admin: SupabaseClient,
  chargeIds: string[] | null,
): Promise<Map<string, string>> {
  const firstSent = new Map<string, string>()
  const slices = chargeIds ? chunk(chargeIds) : [null]
  for (const slice of slices) {
    let query = admin
      .from('email_messages')
      .select('payment_charge_id, sent_at, created_at')
      .eq('kind', 'payment_link')
      .in('status', LINK_SENT_STATUSES)
      .not('payment_charge_id', 'is', null)
    if (slice) query = query.in('payment_charge_id', slice)
    const { data, error } = await query
    if (error) throw new Error(`Envios do link não lidos: ${error.message}`)
    for (const row of (data ?? []) as {
      payment_charge_id: string
      sent_at: string | null
      created_at: string
    }[]) {
      const at = row.sent_at ?? row.created_at
      const current = firstSent.get(row.payment_charge_id)
      if (!current || at < current) firstSent.set(row.payment_charge_id, at)
    }
  }
  return firstSent
}

// ── Link de pagamento ───────────────────────────────────────────────────────

type BillingFailure = Extract<SendEmailResult, { ok: false }>

function refuse(status: number, error: string): BillingFailure {
  return { ok: false, status, error, message: null }
}

/**
 * Manda o link EM ABERTO por e-mail — o mesmo que o botão do WhatsApp manda.
 * Manual: sem `dedupe_key`, reenviar de propósito é permitido.
 */
export async function sendPaymentLinkEmail(
  admin: SupabaseClient,
  { chargeId, sentBy }: { chargeId: string; sentBy: string },
): Promise<SendEmailResult> {
  const config = getEmailConfig()
  if (!config) {
    return refuse(503, 'O envio de e-mail não está configurado (Configurações → E-mail).')
  }

  const charge = await loadCharge(admin, chargeId)
  if (!charge) return refuse(404, 'Cobrança não encontrada.')
  if (charge.status !== 'open' || !charge.checkout_url) {
    return refuse(409, 'Só um link em aberto pode ser enviado.')
  }
  const client = charge.entry?.client ?? null
  if (!client) return refuse(409, 'O lançamento não tem cliente — não há para quem mandar.')
  const to = pickClientEmail(client)
  if (!to) return refuse(409, 'O cadastro do cliente não tem um e-mail válido.')

  const office = await loadOfficeIdentity(admin)
  const data = chargeData(charge)
  const content = await renderEmail(
    createElement(PaymentLinkEmail, {
      office,
      greetingName: getClientGreetingName(client),
      charge: data,
      checkoutUrl: charge.checkout_url,
    }),
  )

  return sendEmail(
    admin,
    {
      kind: 'payment_link',
      resource: 'financeiro',
      clientId: client.id,
      paymentChargeId: charge.id,
      to,
      subject: paymentLinkSubject(charge.description, office),
      content,
      office,
      sentBy,
    },
    config,
  )
}

// ── Confirmação ─────────────────────────────────────────────────────────────

interface TransactionForEmail {
  id: string
  paid_amount_cents: number
  capture_method: string | null
  receipt_url: string | null
  confirmed_at: string
}

/**
 * A confirmação, chamada por `confirmPayment` quando o pagamento deu baixa.
 *
 * Nunca lança: o pagamento já está gravado e a baixa feita, e um e-mail que
 * não sai não pode desfazer nem atrasar nada disso. A `dedupe_key` por
 * transação faz a reentrega do webhook e o retorno do cliente — que chegam
 * juntos — mandarem um e-mail só.
 */
export async function sendPaymentConfirmationEmail(
  admin: SupabaseClient,
  { chargeId, transactionId }: { chargeId: string; transactionId: string },
): Promise<void> {
  try {
    const config = getEmailConfig()
    if (!config) return

    const emailed = await linkEmailedAt(admin, [chargeId])
    if (!emailed.has(chargeId)) return

    const charge = await loadCharge(admin, chargeId)
    const client = charge?.entry?.client ?? null
    const to = client ? pickClientEmail(client) : null
    if (!charge || !client || !to) return

    const { data, error } = await admin
      .from('payment_transactions')
      .select('id, paid_amount_cents, capture_method, receipt_url, confirmed_at')
      .eq('id', transactionId)
      .maybeSingle()
    if (error) throw new Error(`Transação não lida: ${error.message}`)
    if (!data) return
    const transaction = data as TransactionForEmail

    const office = await loadOfficeIdentity(admin)
    const content = await renderEmail(
      createElement(PaymentConfirmedEmail, {
        office,
        greetingName: getClientGreetingName(client),
        charge: chargeData(charge, transaction.paid_amount_cents),
        confirmedOn: formatInstantDay(transaction.confirmed_at),
        method: describeCaptureMethod(transaction.capture_method),
        // Gravado já filtrado pelo domínio da InfinitePay (`trustedReceiptUrl`).
        receiptUrl: transaction.receipt_url,
      }),
    )

    const result = await sendEmail(
      admin,
      {
        kind: 'payment_confirmed',
        resource: 'financeiro',
        clientId: client.id,
        paymentChargeId: charge.id,
        to,
        subject: paymentConfirmedSubject(charge.description, office),
        content,
        office,
        sentBy: null,
        dedupeKey: `payment_confirmed:${transaction.id}`,
      },
      config,
    )
    if (!result.ok && result.message) {
      console.error('[email/cobranca] confirmação não saiu:', chargeId, result.error)
    }
  } catch (error) {
    console.error(
      '[email/cobranca] confirmação não montada:',
      chargeId,
      error instanceof Error ? error.message : error,
    )
  }
}

// ── Lembretes ───────────────────────────────────────────────────────────────

export interface ReminderRunResult {
  /** Cobranças em aberto com o link enviado por e-mail. */
  considered: number
  sent: number
  failed: number
  /** Já lembradas neste momento, fora da janela, sem e-mail no cadastro… */
  skipped: Record<string, number>
  errors: string[]
}

/** Em que momento do lembrete a cobrança está hoje, ou null se em nenhum. */
export function reminderMoment(
  dueDate: string,
  today: string,
  linkEmailedAt: string,
  now: Date,
): PaymentReminderMoment | null {
  const daysToDue = daysBetween(today, dueDate)
  if (daysToDue >= REMINDER_BEFORE_DAYS.min && daysToDue <= REMINDER_BEFORE_DAYS.max) {
    const hoursSinceLink = (now.getTime() - Date.parse(linkEmailedAt)) / HOUR_MS
    return hoursSinceLink >= REMINDER_MIN_HOURS_AFTER_LINK ? 'before_due' : null
  }
  if (-daysToDue >= REMINDER_OVERDUE_DAYS.min && -daysToDue <= REMINDER_OVERDUE_DAYS.max) {
    return 'overdue'
  }
  return null
}

/**
 * Os lembretes do dia, pelo cron das 18h. Um por cobrança e por momento
 * (`payment_reminder:<cobrança>:<momento>`): antes do vencimento e depois dele,
 * no máximo, e só enquanto o link estiver em aberto e o lançamento pendente.
 */
export async function runPaymentReminders(
  admin: SupabaseClient,
  { now = new Date() }: { now?: Date } = {},
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { considered: 0, sent: 0, failed: 0, skipped: {}, errors: [] }
  const skip = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1
  }

  const config: EmailConfig | null = getEmailConfig()
  if (!config) return result

  const emailed = await linkEmailedAt(admin, null)
  if (emailed.size === 0) return result

  const charges: ChargeForEmail[] = []
  for (const slice of chunk([...emailed.keys()])) {
    const { data, error } = await admin
      .from('payment_charges')
      .select(CHARGE_FOR_EMAIL)
      .in('id', slice)
      .eq('status', 'open')
    if (error) throw new Error(`Cobranças não lidas: ${error.message}`)
    charges.push(...((data ?? []) as unknown as ChargeForEmail[]))
  }
  result.considered = charges.length

  const today = brazilDay(now)
  const due: { charge: ChargeForEmail; moment: PaymentReminderMoment; key: string }[] = []
  for (const charge of charges) {
    const entry = charge.entry
    if (!entry || entry.type !== 'receita' || entry.status !== 'pendente' || !entry.due_date) {
      skip('lancamento_nao_pendente')
      continue
    }
    const moment = reminderMoment(entry.due_date, today, emailed.get(charge.id) ?? '', now)
    if (!moment) {
      skip('fora_da_janela')
      continue
    }
    due.push({ charge, moment, key: `payment_reminder:${charge.id}:${moment}` })
  }
  if (due.length === 0) return result

  // Os já lembrados saem antes de montar o e-mail: a janela tem vários dias, e
  // a `dedupe_key` sozinha só os barraria depois de renderizar cada um.
  const alreadySent = new Set<string>()
  for (const slice of chunk(due.map((item) => item.key))) {
    const { data, error } = await admin.from('email_messages').select('dedupe_key').in('dedupe_key', slice)
    if (error) throw new Error(`Lembretes anteriores não lidos: ${error.message}`)
    for (const row of (data ?? []) as { dedupe_key: string }[]) alreadySent.add(row.dedupe_key)
  }

  let office: OfficeIdentity | null = null
  for (const { charge, moment, key } of due) {
    if (alreadySent.has(key)) {
      skip('ja_lembrado')
      continue
    }
    const client = charge.entry?.client ?? null
    const to = client ? pickClientEmail(client) : null
    if (!client || !to || !charge.checkout_url) {
      skip('sem_email')
      continue
    }

    try {
      office ??= await loadOfficeIdentity(admin)
      const data = chargeData(charge)
      const content = await renderEmail(
        createElement(PaymentReminderEmail, {
          office,
          greetingName: getClientGreetingName(client),
          charge: data,
          checkoutUrl: charge.checkout_url,
          moment,
        }),
      )
      const sent = await sendEmail(
        admin,
        {
          kind: 'payment_reminder',
          resource: 'financeiro',
          clientId: client.id,
          paymentChargeId: charge.id,
          to,
          subject: paymentReminderSubject(moment, data, office),
          content,
          office,
          sentBy: null,
          dedupeKey: key,
        },
        config,
      )
      if (sent.ok) result.sent += 1
      else if (sent.status === 409 && !sent.message) skip('ja_lembrado')
      else {
        result.failed += 1
        if (result.errors.length < 10) result.errors.push(`${charge.id}: ${sent.error}`)
      }
    } catch (error) {
      result.failed += 1
      const detail = error instanceof Error ? error.message : String(error)
      if (result.errors.length < 10) result.errors.push(`${charge.id}: ${detail}`)
    }
  }

  return result
}
