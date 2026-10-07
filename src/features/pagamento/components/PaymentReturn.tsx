'use client'

import { CircleAlert, CircleCheck, Clock, Loader2, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/financialEntry.types'
import { describeCaptureMethod } from '@/types/paymentCharge.types'
import { usePaymentReturn, type PaymentReturnParams } from '../hooks/usePaymentReturn'

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-md flex-col items-center gap-3',
        'px-4 py-16 text-center',
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

function ReceiptLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <Receipt className="size-4" aria-hidden />
      Ver o comprovante
    </a>
  )
}

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
