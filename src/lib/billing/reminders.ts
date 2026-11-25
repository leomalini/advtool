// Server-side. O client é a service_role da rota, chamada depois de
// `requireApiPermission`: `billings`, `billing_messages` e a opção do cliente
// mudam só por aqui.
import type { SupabaseClient } from '@supabase/supabase-js'
import { toBrazilianE164 } from '@/utils/format'
import {
  BILLING_COLUMNS,
  BILLING_MESSAGE_COLUMNS,
  type Billing,
  type BillingMessage,
} from '@/types/billing.types'
import { openBilling, type BillingFailure, type BillingResult } from './billings'

/** Violação de índice único: o mesmo aviso duas vezes. */
const UNIQUE_VIOLATION = '23505'

/** Desfazer só vale para o que a própria pessoa registrou há pouco. */
const UNDO_WINDOW_MS = 12 * 3_600_000

function failure(status: number, error: string, code: string | null = null): BillingFailure {
  return { ok: false, status, error, code }
}

async function activeBillingOf(
  supabase: SupabaseClient,
  entryId: string,
): Promise<Billing | null> {
  const { data, error } = await supabase
    .from('billings')
    .select(BILLING_COLUMNS)
    .eq('financial_entry_id', entryId)
    .is('canceled_at', null)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Billing | null) ?? null
}

async function updateBilling(
  supabase: SupabaseClient,
  billingId: string,
  patch: Record<string, unknown>,
): Promise<Billing> {
  const { data, error } = await supabase
    .from('billings')
    .update(patch)
    .eq('id', billingId)
    .select(BILLING_COLUMNS)
    .single()
  if (error) throw error
  return data as unknown as Billing
}

const NO_ACTIVE = 'Não há cobrança no ar para este lançamento.'

/**
 * Liga ou desliga os lembretes. Ligar exige vencimento: a régua conta a partir
 * dele. Religar marca o dia de novo — a etapa "ao criar" e o corte das etapas
 * passam a valer de hoje.
 */
export async function setReminders(
  supabase: SupabaseClient,
  input: { entryId: string; enabled: boolean },
): Promise<BillingResult> {
  const billing = await activeBillingOf(supabase, input.entryId)
  if (!billing) return failure(404, NO_ACTIVE)
  if (billing.reminders_enabled === input.enabled && !(input.enabled && billing.paused_at)) {
    return { ok: true, billing }
  }

  if (input.enabled) {
    const { data, error } = await supabase
      .from('financial_entries')
      .select('settlement_kind, due_date')
      .eq('id', input.entryId)
      .single()
    if (error) throw error
    const entry = data as { settlement_kind: string; due_date: string | null }
    if (entry.settlement_kind !== 'scheduled' || !entry.due_date) {
      return failure(
        422,
        'Lembretes precisam de vencimento: a régua conta os dias a partir dele.',
        'no_due_date',
      )
    }
  }

  return {
    ok: true,
    billing: await updateBilling(
      supabase,
      billing.id,
      input.enabled
        ? {
            reminders_enabled: true,
            // Religar não recomeça a régua de quem só estava pausado.
            reminders_enabled_at: billing.reminders_enabled
              ? billing.reminders_enabled_at
              : new Date().toISOString(),
            paused_at: null,
          }
        : { reminders_enabled: false, paused_at: null },
    ),
  }
}

/** Pausa ou retoma: a régua para sem perder o dia em que foi ligada. */
export async function setPaused(
  supabase: SupabaseClient,
  input: { entryId: string; paused: boolean },
): Promise<BillingResult> {
  const billing = await activeBillingOf(supabase, input.entryId)
  if (!billing) return failure(404, NO_ACTIVE)
  if (!billing.reminders_enabled) return failure(409, 'Os lembretes desta cobrança estão desligados.')
  if ((billing.paused_at !== null) === input.paused) return { ok: true, billing }
  return {
    ok: true,
    billing: await updateBilling(supabase, billing.id, {
      paused_at: input.paused ? new Date().toISOString() : null,
    }),
  }
}

/** Os percentuais da cobrança (migration 97). Null desliga; o que não vier
 * fica como está. Valem no próximo clique em "Pagar": o link já aberto segue
 * com o preço que tinha até vencer. */
export interface BillingTermsChange {
  lateFeePercent?: number | null
  monthlyInterestPercent?: number | null
  pixDiscountPercent?: number | null
}

export async function setBillingTerms(
  supabase: SupabaseClient,
  input: { entryId: string; terms: BillingTermsChange },
): Promise<BillingResult> {
  const billing = await activeBillingOf(supabase, input.entryId)
  if (!billing) return failure(404, NO_ACTIVE)

  const { lateFeePercent, monthlyInterestPercent, pixDiscountPercent } = input.terms
  // 0 é o mesmo que sem: a coluna guarda null, e a tela mostra "sem".
  const orNull = (value: number | null) => (value === null || value === 0 ? null : value)
  return {
    ok: true,
    billing: await updateBilling(supabase, billing.id, {
      ...(lateFeePercent !== undefined ? { late_fee_percent: orNull(lateFeePercent) } : {}),
      ...(monthlyInterestPercent !== undefined
        ? { monthly_interest_percent: orNull(monthlyInterestPercent) }
        : {}),
      ...(pixDiscountPercent !== undefined
        ? { pix_discount_percent: orNull(pixDiscountPercent) }
        : {}),
    }),
  }
}

/** O telefone desta cobrança; null volta ao contato principal do cliente. */
export async function setRecipientPhone(
  supabase: SupabaseClient,
  input: { entryId: string; phone: string | null },
): Promise<BillingResult> {
  const billing = await activeBillingOf(supabase, input.entryId)
  if (!billing) return failure(404, NO_ACTIVE)

  let phone: string | null = null
  if (input.phone !== null && input.phone.trim() !== '') {
    phone = toBrazilianE164(input.phone)
    if (!phone) {
      return failure(422, 'Informe um celular brasileiro com DDD.', 'invalid_phone')
    }
  }
  return { ok: true, billing: await updateBilling(supabase, billing.id, { recipient_phone: phone }) }
}

/**
 * O cliente pediu (ou deixou de pedir) para não receber lembretes. Vale para
 * todas as cobranças dele; a página de pagamento continua no ar.
 */
export async function setClientOptOut(
  supabase: SupabaseClient,
  input: { entryId: string; optOut: boolean },
): Promise<BillingResult> {
  const billing = await activeBillingOf(supabase, input.entryId)
  if (!billing) return failure(404, NO_ACTIVE)

  const { data, error } = await supabase
    .from('financial_entries')
    .select('client_id')
    .eq('id', input.entryId)
    .single()
  if (error) throw error
  const clientId = (data as { client_id: string | null }).client_id
  if (!clientId) return failure(422, 'O lançamento não tem cliente.', 'no_client')

  const { error: clientError } = await supabase
    .from('clients')
    .update({ billing_reminders_opt_out: input.optOut })
    .eq('id', clientId)
  if (clientError) throw clientError
  return { ok: true, billing }
}

export type ReminderRecordResult =
  | { ok: true; message: BillingMessage; duplicate: boolean }
  | BillingFailure

/**
 * Registra o que o escritório fez com o aviso de uma etapa: abriu no WhatsApp
 * (`manual`) ou decidiu não mandar (`skipped`). O índice único da migration 96
 * faz o segundo clique devolver o primeiro registro, em vez de duplicar.
 */
export async function recordReminder(
  supabase: SupabaseClient,
  input: {
    billingId: string
    step: string
    dueDate: string
    status: 'manual' | 'skipped'
    userId: string
  },
): Promise<ReminderRecordResult> {
  const { data: billing, error: billingError } = await supabase
    .from('billings')
    .select('id, canceled_at')
    .eq('id', input.billingId)
    .maybeSingle()
  if (billingError) throw billingError
  if (!billing) return failure(404, 'Cobrança não encontrada.')
  if ((billing as { canceled_at: string | null }).canceled_at) {
    return failure(409, 'Esta cobrança foi encerrada.')
  }

  const { data, error } = await supabase
    .from('billing_messages')
    .insert({
      billing_id: input.billingId,
      step: input.step,
      due_date: input.dueDate,
      channel: 'whatsapp',
      status: input.status,
      created_by: input.userId,
    })
    .select(BILLING_MESSAGE_COLUMNS)
    .single()

  if (error?.code === UNIQUE_VIOLATION) {
    const { data: existing, error: existingError } = await supabase
      .from('billing_messages')
      .select(BILLING_MESSAGE_COLUMNS)
      .eq('billing_id', input.billingId)
      .eq('step', input.step)
      .eq('due_date', input.dueDate)
      .eq('channel', 'whatsapp')
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return { ok: true, message: existing as unknown as BillingMessage, duplicate: true }
    }
  }
  if (error) throw error
  return { ok: true, message: data as unknown as BillingMessage, duplicate: false }
}

/** Desfaz um registro da fila: só o da própria pessoa, de até 12 horas. */
export async function undoReminder(
  supabase: SupabaseClient,
  input: { messageId: string; userId: string; now?: Date },
): Promise<{ ok: true } | BillingFailure> {
  const since = new Date((input.now ?? new Date()).getTime() - UNDO_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('billing_messages')
    .delete()
    .eq('id', input.messageId)
    .eq('created_by', input.userId)
    .in('status', ['manual', 'skipped'])
    .gte('created_at', since)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
    ? { ok: true }
    : failure(404, 'Não há o que desfazer: o registro é de outra pessoa ou de mais de 12 horas.')
}

export interface BatchResult {
  entryId: string
  ok: boolean
  error: string | null
}

/**
 * Põe no ar a cobrança de cada lançamento e liga os lembretes — o lote da aba
 * Cobranças e da prévia do contrato. Um que falha não para os outros.
 */
export async function enableRemindersBatch(
  supabase: SupabaseClient,
  input: { entryIds: readonly string[]; userId: string },
): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  for (const entryId of input.entryIds) {
    try {
      const opened = await openBilling(supabase, { entryId, userId: input.userId })
      if (!opened.ok) {
        results.push({ entryId, ok: false, error: opened.error })
        continue
      }
      const enabled = await setReminders(supabase, { entryId, enabled: true })
      results.push({ entryId, ok: enabled.ok, error: enabled.ok ? null : enabled.error })
    } catch (error) {
      console.error('[billing] lote: lançamento não entrou na régua:', entryId, error)
      results.push({ entryId, ok: false, error: 'Falha inesperada.' })
    }
  }
  return results
}
