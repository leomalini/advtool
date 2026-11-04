import { cn } from '@/lib/utils'
import {
  SUCCESS_FEE_STAGE_LABELS,
  getSuccessFeeStage,
  type FinancialEntry,
  type SuccessFeeStage,
} from '@/types/financialEntry.types'

/** The colours of FinancialSituationBadge, plus "a apurar" in the muted tone:
 * it is not money yet. */
const STAGE_CLASSES: Record<SuccessFeeStage, string> = {
  a_apurar: 'bg-muted text-muted-foreground border-border',
  aguardando: 'bg-info/12 text-info border-info/25',
  a_vencer: 'bg-warning/12 text-warning border-warning/25',
  vencido: 'bg-destructive/12 text-destructive border-destructive/25',
  recebido: 'bg-success/12 text-success border-success/25',
}

interface SuccessFeeStageBadgeProps {
  entry: Pick<
    FinancialEntry,
    'status' | 'settlement_kind' | 'due_date' | 'percent' | 'base_amount'
  >
  className?: string
}

/** Where a success fee stands — the Êxitos tab's badge. */
export function SuccessFeeStageBadge({ entry, className }: SuccessFeeStageBadgeProps) {
  const stage = getSuccessFeeStage(entry)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        STAGE_CLASSES[stage],
        className
      )}
    >
      {SUCCESS_FEE_STAGE_LABELS[stage]}
    </span>
  )
}
