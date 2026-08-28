import { cn } from '@/lib/utils'
import {
  FINANCIAL_SITUATION_LABELS,
  getFinancialSituation,
  type FinancialEntry,
  type FinancialSituation,
} from '@/types/financialEntry.types'

/** Uma cor por situação, definida uma vez. Antes deste componente o mesmo
 * ternário pago/atrasado/pendente estava copiado em três telas, e cada uma
 * pintava com um conjunto de classes ligeiramente diferente. */
const SITUATION_CLASSES: Record<FinancialSituation, string> = {
  pago: 'bg-success/12 text-success border-success/25',
  a_vencer: 'bg-warning/12 text-warning border-warning/25',
  vencido: 'bg-destructive/12 text-destructive border-destructive/25',
  condicao_especial: 'bg-info/12 text-info border-info/25',
}

/** "Condição especial" não cabe numa coluna de tabela ao lado da descrição. */
const SHORT_LABELS: Partial<Record<FinancialSituation, string>> = {
  condicao_especial: 'Condição',
}

interface FinancialSituationBadgeProps {
  entry: Pick<FinancialEntry, 'status' | 'settlement_kind' | 'due_date'>
  /** Encurta o rótulo onde o espaço é apertado; o título completo fica no hover. */
  short?: boolean
  bordered?: boolean
  className?: string
}

export function FinancialSituationBadge({
  entry,
  short,
  bordered,
  className,
}: FinancialSituationBadgeProps) {
  const situation = getFinancialSituation(entry)
  const label = FINANCIAL_SITUATION_LABELS[situation]
  const shown = short ? (SHORT_LABELS[situation] ?? label) : label

  return (
    <span
      title={shown === label ? undefined : label}
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0',
        bordered && 'border',
        SITUATION_CLASSES[situation],
        className
      )}
    >
      {shown}
    </span>
  )
}
