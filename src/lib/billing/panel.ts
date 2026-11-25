// Server-side. O client é a service_role da rota (depois de conferir
// `financeiro:view`) ou do cron: o painel precisa das URLs, que só o servidor
// monta, e da mesma conta da régua que o cron faz.
import type { SupabaseClient } from '@supabase/supabase-js'
import { pickClientPhone, type PaymentClient } from '@/lib/infinitepay/customer'
import {
  BILLING_COLUMNS,
  BILLING_MESSAGE_COLUMNS,
  HANDLED_MESSAGE_STATUSES,
  type Billing,
  type BillingMessage,
  type BillingPanel,
  type BillingPanelItem,
} from '@/types/billing.types'
import type {
  FinancialEntryStatus,
  FinancialSettlementKind,
} from '@/types/financialEntry.types'
import { isChargeLive, type PaymentChargeStatus } from '@/types/paymentCharge.types'
import { infinitePayApiKey } from '@/lib/infinitepay/client'
import { billingAmountToday } from './checkout'
import { clientDisplayName } from './entries'
import { officeDateOf } from './officeTime'
import {
  DEFAULT_REMINDER_OFFSETS,
  billingReminderState,
  dueReminder,
  nextReminder,
  normalizeOffsets,
  planReminderSteps,
} from './schedule'
import { billingPageUrl } from './urls'

/** Teto do painel: a aba mostra as cobranças do escritório inteiro, e as
 * pagas antigas não precisam vir todas. */
const PANEL_LIMIT = 500

const PANEL_SELECT = `${BILLING_COLUMNS},
  messages:billing_messages(${BILLING_MESSAGE_COLUMNS}),
  financial_entries!inner(id, description, amount, due_date, status, type, settlement_kind,
    payment_charges(id, status, expires_at),
    client:clients(id, type, name, company_name, trade_name, email, phone,
      billing_reminders_opt_out, contacts:client_contacts(type, value, is_primary)))`

interface PanelRow extends Billing {
  messages: BillingMessage[] | null
  financial_entries: {
    id: string
    description: string
    amount: number
    due_date: string | null
    status: FinancialEntryStatus
    type: 'receita' | 'despesa'
    settlement_kind: FinancialSettlementKind
    payment_charges: { id: string; status: PaymentChargeStatus; expires_at: string | null }[] | null
    client: (PaymentClient & { id: string; billing_reminders_opt_out: boolean }) | null
  }
}

export interface PanelContext {
  today: string
  now: Date
  offsets: readonly number[]
  /** Há API Key: o desconto no Pix pode ir no link (migration 97). */
  discountAvailable: boolean
}

/** Uma linha do banco, com a régua aplicada. Puro, a não ser a URL. */
export function toPanelItem(
  row: PanelRow,
  url: string,
  context: PanelContext,
): BillingPanelItem {
  const { messages: rawMessages, financial_entries: entry, ...billing } = row
  const client = entry.client
  const clientPhone = pickClientPhone(client)
  const optedOut = client?.billing_reminders_opt_out ?? false
  const messages = [...(rawMessages ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )

  const dueDate = entry.settlement_kind === 'scheduled' ? entry.due_date : null
  const plan =
    dueDate && billing.reminders_enabled_at
      ? planReminderSteps({
          dueDate,
          enabledOn: officeDateOf(new Date(billing.reminders_enabled_at)),
          offsets: context.offsets,
        })
      : []
  const handled = new Set(
    messages
      .filter(
        (message) =>
          message.due_date === dueDate &&
          message.step !== 'resend' &&
          HANDLED_MESSAGE_STATUSES.includes(message.status),
      )
      .map((message) => message.step),
  )
  const running =
    billing.reminders_enabled &&
    !billing.paused_at &&
    !billing.canceled_at &&
    entry.status === 'pendente' &&
    !optedOut
  const due = running ? dueReminder(plan, context.today, handled) : null
  const next = running ? nextReminder(plan, context.today) : null

  return {
    billing,
    url,
    entry: {
      id: entry.id,
      description: entry.description,
      amount: Number(entry.amount),
      due_date: entry.due_date,
      status: entry.status,
      settlement_kind: entry.settlement_kind,
    },
    client: client
      ? {
          id: client.id,
          type: client.type,
          displayName: clientDisplayName(client),
          phone: clientPhone,
          optedOut,
        }
      : null,
    recipientPhone: billing.recipient_phone ?? clientPhone,
    messages,
    state: billingReminderState({
      entryPaid: entry.status === 'pago',
      closed: billing.canceled_at !== null,
      remindersEnabled: billing.reminders_enabled,
      optedOut,
      paused: billing.paused_at !== null,
      dueDate,
      today: context.today,
      due,
      next,
    }),
    dueStep: due,
    nextStep: next,
    liveChargeId:
      (entry.payment_charges ?? []).find((charge) => isChargeLive(charge, context.now))?.id ??
      null,
    amountToday: billingAmountToday(billing, entry, context.now, {
      discountAvailable: context.discountAvailable,
    }),
  }
}

interface OfficeRow {
  name: string | null
  phone: string | null
  billing_reminder_offsets: number[] | null
}

async function loadOffice(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('office_settings')
    .select('name, phone, billing_reminder_offsets')
    .maybeSingle()
  if (error) throw error
  const office = data as OfficeRow | null
  const offsets = normalizeOffsets(office?.billing_reminder_offsets ?? DEFAULT_REMINDER_OFFSETS)
  return {
    name: office?.name?.trim() || null,
    phone: office?.phone?.trim() || null,
    offsets: offsets.length > 0 ? offsets : [...DEFAULT_REMINDER_OFFSETS],
  }
}

/** Todas as cobranças de receitas, com a régua de hoje — a aba Cobranças. */
export async function loadBillingPanel(
  supabase: SupabaseClient,
  input: { requestOrigin: string; now?: Date },
): Promise<BillingPanel> {
  const now = input.now ?? new Date()
  const today = officeDateOf(now)
  const office = await loadOffice(supabase)

  const { data, error } = await supabase
    .from('billings')
    .select(PANEL_SELECT)
    .eq('financial_entries.type', 'receita')
    .order('created_at', { ascending: false })
    .limit(PANEL_LIMIT)
  if (error) throw error

  const context: PanelContext = {
    today,
    now,
    offsets: office.offsets,
    discountAvailable: infinitePayApiKey() !== null,
  }
  const items = await Promise.all(
    ((data ?? []) as unknown as PanelRow[]).map(async (row) =>
      toPanelItem(row, await billingPageUrl(row.id, input.requestOrigin), context),
    ),
  )

  return { today, officeName: office.name, officePhone: office.phone, offsets: office.offsets, items }
}

/** A cobrança de um lançamento, com a régua de hoje — o detalhe. */
export async function loadBillingPanelItem(
  supabase: SupabaseClient,
  input: { entryId: string; requestOrigin: string; now?: Date },
): Promise<{ item: BillingPanelItem; officeName: string | null; officePhone: string | null } | null> {
  const now = input.now ?? new Date()
  const office = await loadOffice(supabase)

  const { data, error } = await supabase
    .from('billings')
    .select(PANEL_SELECT)
    .eq('financial_entry_id', input.entryId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as unknown as PanelRow
  const item = toPanelItem(row, await billingPageUrl(row.id, input.requestOrigin), {
    today: officeDateOf(now),
    now,
    offsets: office.offsets,
    discountAvailable: infinitePayApiKey() !== null,
  })
  return { item, officeName: office.name, officePhone: office.phone }
}
