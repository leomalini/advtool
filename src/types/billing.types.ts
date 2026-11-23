import type { BillingReminderState, PlannedStep } from '@/lib/billing/schedule'
import type {
  FinancialEntryCategory,
  FinancialEntryStatus,
  FinancialSettlementKind,
} from './financialEntry.types'

/**
 * Espelha `public.billings` (migration 95): a cobrança de um lançamento, que o
 * cliente abre em `/pagar/<token>`. Plano em `docs/cobrancas.md`.
 *
 * O hash do token fica de fora: a tela não tem o que fazer com ele, e a URL só
 * sai do servidor, que deriva o token do id.
 */
export interface Billing {
  id: string
  financial_entry_id: string
  /** O que o cliente lê. A descrição do lançamento é interna. */
  client_description: string
  /** Primeira e última abertura pelo cliente; o escritório logado não conta. */
  viewed_at: string | null
  last_viewed_at: string | null
  /** Último clique em "Pagar". */
  checkout_clicked_at: string | null
  /** Encerrada: a página sai do ar. Gerar de novo a religa, mesma URL. */
  canceled_at: string | null
  canceled_by: string | null
  /** Lembretes ligados (migration 96). `reminders_enabled_at` é o dia da
   * etapa "ao criar" e o corte do que já passou. */
  reminders_enabled: boolean
  reminders_enabled_at: string | null
  paused_at: string | null
  /** Telefone dos lembretes, no lugar do contato principal do cliente. */
  recipient_phone: string | null
  /** Para qual clique e qual vencimento o sino já avisou. */
  click_alert_for: string | null
  ended_alert_for: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export const BILLING_COLUMNS =
  'id, financial_entry_id, client_description, viewed_at, last_viewed_at, ' +
  'checkout_clicked_at, canceled_at, canceled_by, reminders_enabled, reminders_enabled_at, ' +
  'paused_at, recipient_phone, click_alert_for, ended_alert_for, created_by, created_at, ' +
  'updated_at'

// ── Régua de avisos (migration 96) ──────────────────────────────────────────

export type BillingMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped'
  | 'manual'

/** O que já tratou da etapa: ela não volta para a fila. `failed` volta. */
export const HANDLED_MESSAGE_STATUSES: readonly BillingMessageStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'skipped',
  'manual',
]

export const BILLING_MESSAGE_STATUS_LABELS: Record<BillingMessageStatus, string> = {
  pending: 'Na fila de envio',
  sent: 'Enviado',
  delivered: 'Entregue',
  read: 'Lido',
  failed: 'Falhou',
  skipped: 'Pulado',
  // WhatsApp aberto ou mensagem copiada: o sistema não sabe se saiu.
  manual: 'Feito à mão',
}

/** Um aviso da régua: o que aconteceu com uma etapa. */
export interface BillingMessage {
  id: string
  billing_id: string
  step: string
  due_date: string
  channel: 'whatsapp' | 'email'
  status: BillingMessageStatus
  error: string | null
  created_by: string | null
  created_at: string
}

export const BILLING_MESSAGE_COLUMNS =
  'id, billing_id, step, due_date, channel, status, error, created_by, created_at'

/** Uma cobrança com tudo o que a aba Cobranças e o detalhe mostram, já
 * calculado no servidor pela mesma régua do cron (`lib/billing/schedule.ts`). */
export interface BillingPanelItem {
  billing: Billing
  url: string
  entry: {
    id: string
    description: string
    amount: number
    due_date: string | null
    status: FinancialEntryStatus
    settlement_kind: FinancialSettlementKind
  }
  client: {
    id: string
    type: 'individual' | 'company'
    displayName: string | null
    /** Contato principal em E.164; null sem telefone brasileiro válido. */
    phone: string | null
    optedOut: boolean
  } | null
  /** Para onde vai o aviso: o telefone da cobrança ou o do cliente. */
  recipientPhone: string | null
  /** Do mais novo ao mais antigo. */
  messages: BillingMessage[]
  state: BillingReminderState
  /** O aviso de hoje, se houver. */
  dueStep: PlannedStep | null
  nextStep: PlannedStep | null
  /** O checkout da InfinitePay ainda pagável, se o cliente abriu um. */
  liveChargeId: string | null
}

export interface BillingPanel {
  /** Hoje, em Brasília ('yyyy-MM-dd'). */
  today: string
  officeName: string | null
  officePhone: string | null
  offsets: number[]
  items: BillingPanelItem[]
}

/** O limite da coluna (`char_length <= 120`). */
export const CLIENT_DESCRIPTION_MAX = 120

/** O menor valor que a InfinitePay aceita por pagamento: R$ 1,00. */
export const MIN_BILLING_AMOUNT_CENTS = 100

/** A cobrança e o endereço que o escritório manda — a URL só existe no
 * servidor. */
export interface BillingWithUrl {
  billing: Billing
  url: string
}

/** Uma cobrança no ar, como o card do dashboard lista. */
export interface OpenBilling {
  billing: Billing
  url: string
  entry: {
    id: string
    description: string
    amount: number
    due_date: string | null
  }
  client_name: string | null
}

const CATEGORY_DESCRIPTIONS: Record<FinancialEntryCategory, string> = {
  honorario: 'Honorários advocatícios',
  exito: 'Honorários de êxito',
  custas: 'Custas processuais',
  pericia: 'Honorários periciais',
  outros: 'Serviços advocatícios',
}

/**
 * A descrição que o cliente vê, sugerida a partir do lançamento: o que é, pela
 * categoria, e a parcela, se a descrição interna disser ("… — parcela 2/6").
 * Nunca a descrição interna inteira: ela pode citar o caso, e a mensagem passa
 * pelo WhatsApp, pelo checkout e pelo celular de quem estiver por perto.
 */
export function defaultClientDescription(entry: {
  category: FinancialEntryCategory
  description: string
}): string {
  const base = CATEGORY_DESCRIPTIONS[entry.category]
  const installment = /parcela\s+(\d{1,3})\s*\/\s*(\d{1,3})/i.exec(entry.description)
  return installment ? `${base} — parcela ${installment[1]}/${installment[2]}` : base
}

/**
 * O que a página pública recebe da rota. O mínimo, porque a URL pode ser
 * encaminhada: nada do cliente nem do processo.
 */
export type PublicBillingView =
  | {
      status: 'open'
      officeName: string | null
      description: string
      amountCents: number
      /** Vencimento, só quando o lançamento tem data ('scheduled'). */
      dueDate: string | null
    }
  | {
      status: 'paid'
      officeName: string | null
      description: string
      /** O que o cliente pagou, juros do parcelamento incluídos; nulo na baixa
       * feita à mão pelo escritório. */
      paidAmountCents: number | null
      paidAt: string | null
      receiptUrl: string | null
    }
  | {
      /** Encerrada, ou o lançamento deixou de ser cobrável. */
      status: 'unavailable'
      officeName: string | null
      officePhone: string | null
    }
  | { status: 'not_found' }

/** A resposta do clique em "Pagar": o checkout, ou o estado que impediu. */
export type BillingCheckoutResult =
  | { status: 'redirect'; url: string }
  | Exclude<PublicBillingView, { status: 'open' }>
