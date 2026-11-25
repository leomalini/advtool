import type { BillingPanelItem } from '@/types/billing.types'
import { remindersRunning } from './schedule'

/**
 * Os recortes da aba Cobranças, num módulo comum: a tela e o Assistente
 * (`ver_cobrancas`) filtram igual.
 */
export type BillingPanelFilter = 'running' | 'overdue' | 'stopped' | 'link_only' | 'paid' | 'all'

export const BILLING_PANEL_FILTERS: { value: BillingPanelFilter; label: string }[] = [
  { value: 'running', label: 'Na régua' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'stopped', label: 'Pausadas ou encerradas' },
  { value: 'link_only', label: 'Só o link' },
  { value: 'paid', label: 'Pagas' },
  { value: 'all', label: 'Todas' },
]

export function matchesBillingFilter(item: BillingPanelItem, filter: BillingPanelFilter): boolean {
  switch (filter) {
    case 'running':
      return remindersRunning(item.state)
    case 'overdue':
      return item.state === 'overdue' || item.state === 'ended'
    case 'stopped':
      return ['paused', 'opted_out', 'closed', 'ended', 'no_due_date'].includes(item.state)
    case 'link_only':
      return item.state === 'link_only'
    case 'paid':
      return item.state === 'paid'
    case 'all':
      return true
  }
}

/**
 * Venceu e não foi paga, com régua ou sem: a inadimplência. Diferente do
 * recorte "Atrasadas" da aba, que é o da régua — uma cobrança só com o link
 * também está devendo.
 */
export function isPastDue(item: BillingPanelItem, today: string): boolean {
  return (
    item.entry.status === 'pendente' &&
    item.billing.canceled_at === null &&
    item.entry.settlement_kind === 'scheduled' &&
    item.entry.due_date !== null &&
    item.entry.due_date < today
  )
}
