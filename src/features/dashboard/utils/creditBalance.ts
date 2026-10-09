import type { CreditBalance } from '@/lib/buscaprocessos/creditBalance'
import type { StatusTone } from './statusTones'

/** Below it the balance reads as low (amber). Chosen on 2026-10-09: at the
 * API's prices — R$ 0,10 an OAB lookup, R$ 0,20 a download — it still covers
 * dozens of charged calls, time enough to top up before it runs out. */
export const LOW_CREDIT_THRESHOLD = 20

/** The status of the observed response; the others are not documented. */
const ACTIVE_ACCOUNT_STATUS = 'ACTIVE'

/** Without balance, or with the account off ACTIVE, the API answers the
 * charged calls with 403 ("Créditos insuficientes ou conta inativa"). */
const REFUSED_HINT = 'a API recusa as consultas cobradas'

export interface CreditStatus {
  tone: Exclude<StatusTone, 'muted'>
  /** Short — the pill and the status line. */
  label: string
  /** What it means for the office, when it means something. */
  hint: string | null
  /** The amount itself is the problem (low or none), so it takes the tone. An
   * inactive account with money left is not a balance problem. */
  amountAtFault: boolean
}

/** Worst first: an inactive account refuses even with balance left. */
export function creditStatus(balance: CreditBalance): CreditStatus {
  if (balance.accountStatus !== ACTIVE_ACCOUNT_STATUS) {
    return {
      tone: 'danger',
      label: 'Conta não ativa',
      hint: `A conta está como ${balance.accountStatus}: ${REFUSED_HINT} até ela voltar a ${ACTIVE_ACCOUNT_STATUS}.`,
      amountAtFault: balance.credits < LOW_CREDIT_THRESHOLD,
    }
  }
  if (balance.credits <= 0) {
    return {
      tone: 'danger',
      label: 'Sem créditos',
      hint: `Sem saldo, ${REFUSED_HINT} até a recarga.`,
      amountAtFault: true,
    }
  }
  if (balance.credits < LOW_CREDIT_THRESHOLD) {
    return {
      tone: 'warning',
      label: 'Saldo baixo',
      hint: `Abaixo de ${formatCredits(LOW_CREDIT_THRESHOLD, 'BRL')}. Quando zerar, ${REFUSED_HINT}.`,
      amountAtFault: true,
    }
  }
  return { tone: 'success', label: 'Conta ativa', hint: null, amountAtFault: false }
}

/** 672.26 → 'R$ 672,26'. With the cents: the cheapest call costs ten of them.
 * A currency code Intl doesn't know throws, and the number should still show. */
export function formatCredits(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
  } catch {
    const amount = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    return `${amount} ${currency}`
  }
}
