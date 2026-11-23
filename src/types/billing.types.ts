import type { FinancialEntryCategory } from './financialEntry.types'

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
  created_by: string
  created_at: string
  updated_at: string
}

export const BILLING_COLUMNS =
  'id, financial_entry_id, client_description, viewed_at, last_viewed_at, ' +
  'checkout_clicked_at, canceled_at, canceled_by, created_by, created_at, updated_at'

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
