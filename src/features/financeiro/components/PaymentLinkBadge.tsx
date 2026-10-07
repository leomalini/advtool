import { BadgeCheck, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { summarizePaymentCharges, type PaymentChargeSummary } from '@/types/paymentCharge.types'

interface PaymentLinkBadgeProps {
  charges?: PaymentChargeSummary[]
  className?: string
}

/**
 * A cobrança online na linha do lançamento: link em aberto, pago pela
 * InfinitePay, ou os dois (um link cancelado pago enquanto outro está aberto).
 * Some quando não há nenhum — mesmo critério do clipe de anexos.
 */
export function PaymentLinkBadge({ charges, className }: PaymentLinkBadgeProps) {
  const { live, paid } = summarizePaymentCharges(charges)
  if (!live && !paid) return null

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      {live && (
        <span title="Link de pagamento em aberto" className="text-info">
          <Link2 className="h-3 w-3" aria-hidden />
          <span className="sr-only">Link de pagamento em aberto</span>
        </span>
      )}
      {paid && (
        <span title="Pago pela InfinitePay" className="text-success">
          <BadgeCheck className="h-3 w-3" aria-hidden />
          <span className="sr-only">Pago pela InfinitePay</span>
        </span>
      )}
    </span>
  )
}
