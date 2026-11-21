import { cn } from '@/lib/utils'
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_TONE,
  type EmailStatus,
} from '@/types/emailMessage.types'

/** Mesma família de selo das listas de webhook em Configurações. */
const TONE_CLASS = {
  success: 'bg-success/12 text-success',
  pending: 'bg-info/12 text-info',
  problem: 'bg-destructive/10 text-destructive',
} as const

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        TONE_CLASS[EMAIL_STATUS_TONE[status]],
      )}
    >
      {EMAIL_STATUS_LABELS[status]}
    </span>
  )
}
