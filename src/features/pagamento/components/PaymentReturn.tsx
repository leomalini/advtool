'use client'

import { CircleAlert, CircleCheck, Clock, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/types/financialEntry.types'
import { describeCaptureMethod } from '@/types/paymentCharge.types'
import { usePaymentReturn, type PaymentReturnParams } from '../hooks/usePaymentReturn'
import { PaymentCard as Card, ReceiptLink } from './PaymentCard'

/**
 * A página para onde o cliente volta depois de pagar.
 *
 * Mostra só o que ajuda quem acabou de pagar — confirmado ou não, valor,
 * método, comprovante — e nada do cliente ou do lançamento: a URL pode ser
 * encaminhada (ver `/api/pagamento/retorno`).
 */
export function PaymentReturn({ params }: { params: PaymentReturnParams | null }) {
  // A rota nem é chamada sem os parâmetros do checkout.
  if (!params) {
    return (
      <Card
        icon={<CircleAlert className="size-6 text-muted-foreground" aria-hidden />}
        title="Link de retorno incompleto"
      >
        <p className="text-sm text-muted-foreground">
          Esta página abre sozinha depois de um pagamento pela InfinitePay. Se você pagou, guarde
          o comprovante que a InfinitePay mostrou e fale com o escritório.
        </p>
      </Card>
    )
  }
  return <ConfirmedReturn params={params} />
}

function ConfirmedReturn({ params }: { params: PaymentReturnParams }) {
  const { data, isPending } = usePaymentReturn(params)

  if (isPending || !data) {
    return (
      <Card
        icon={<Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />}
        title="Confirmando o seu pagamento…"
      />
    )
  }

  const contact = data.officeName ?? 'o escritório'

  if (data.status === 'confirmed') {
    const installments = (data.installments ?? 1) > 1 ? ` em ${data.installments}x` : ''
    const thanks = data.officeName ? `${data.officeName} agradece.` : 'Obrigado!'
    return (
      <Card
        icon={<CircleCheck className="size-6 text-success" aria-hidden />}
        title="Pagamento confirmado"
      >
        {data.paidAmountCents !== null && (
          <p className="text-2xl font-bold tabular-nums">
            {formatCurrency(data.paidAmountCents / 100)}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {`Pago via ${describeCaptureMethod(data.captureMethod)}${installments}. `}
          {`O pagamento já aparece para o escritório. ${thanks}`}
        </p>
        <ReceiptLink url={data.receiptUrl} />
        <p className="text-xs text-muted-foreground">Pode fechar esta página.</p>
      </Card>
    )
  }

  if (data.status === 'pending') {
    return (
      <Card icon={<Clock className="size-6 text-info" aria-hidden />} title="Pagamento recebido">
        <p className="text-sm text-muted-foreground">
          A InfinitePay já registrou o seu pagamento. A confirmação chega ao escritório em
          instantes — não é preciso pagar de novo.
        </p>
        <ReceiptLink url={data.receiptUrl} />
      </Card>
    )
  }

  return (
    <Card
      icon={<CircleAlert className="size-6 text-warning" aria-hidden />}
      title="Não encontramos este pagamento"
    >
      <p className="text-sm text-muted-foreground">
        {`Se você pagou, guarde o comprovante da InfinitePay e fale com ${contact}.`}
      </p>
      <ReceiptLink url={data.receiptUrl} />
    </Card>
  )
}
