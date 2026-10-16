import { cn } from '@/lib/utils'
import {
  CONTRACT_SITUATION_LABELS,
  getContractSituation,
  type Contract,
  type ContractSituation,
} from '@/types/contract.types'

/** Uma cor por situação, definida uma vez — mesmo papel do
 * `FinancialSituationBadge`. */
const SITUATION_CLASSES: Record<ContractSituation, string> = {
  rascunho: 'bg-muted text-muted-foreground border-border',
  aguardando_assinatura: 'bg-info/12 text-info border-info/25',
  vigente: 'bg-success/12 text-success border-success/25',
  vencendo: 'bg-warning/12 text-warning border-warning/25',
  vencido: 'bg-destructive/12 text-destructive border-destructive/25',
  encerrado: 'bg-muted text-muted-foreground border-border',
  rescindido: 'bg-destructive/8 text-destructive/80 border-destructive/20',
}

interface ContractSituationBadgeProps {
  contract: Pick<Contract, 'status' | 'end_date' | 'notice_days'>
  bordered?: boolean
  className?: string
}

export function ContractSituationBadge({
  contract,
  bordered,
  className,
}: ContractSituationBadgeProps) {
  const situation = getContractSituation(contract)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0',
        bordered && 'border',
        SITUATION_CLASSES[situation],
        className
      )}
    >
      {CONTRACT_SITUATION_LABELS[situation]}
    </span>
  )
}
