'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CircleAlert,
  CircleCheck,
  CreditCard,
  Loader2,
  Lock,
  Phone,
  SearchX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PublicBillingView } from '@/types/billing.types'
import { formatCurrency, formatPercent, todayISO } from '@/types/financialEntry.types'
import { useBillingCheckout, useBillingView } from '../hooks/useBillingPage'
import { PaymentCard, ReceiptLink } from './PaymentCard'

function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
}

/**
 * A página que o escritório manda ao cliente: o que é, quanto e até quando, e
 * o botão que leva ao checkout da InfinitePay.
 *
 * Só o que a rota devolve (`/api/pagar/<token>`), e ela devolve o mínimo: a URL
 * pode ser encaminhada, então nada do cliente nem do processo aparece aqui.
 */
export function BillingPayPage({ token }: { token: string }) {
  const view = useBillingView(token)

  if (view.isPending) {
    return (
      <PaymentCard
        icon={<Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />}
        title="Carregando a cobrança…"
      />
    )
  }

  if (view.isError) {
    return (
      <PaymentCard
        icon={<CircleAlert className="size-6 text-warning" aria-hidden />}
        title="Não foi possível carregar a cobrança"
      >
        <p className="text-sm text-muted-foreground">{view.error.message}</p>
        <Button type="button" variant="outline" onClick={() => void view.refetch()}>
          Tentar de novo
        </Button>
      </PaymentCard>
    )
  }

  return <BillingState token={token} data={view.data} />
}

function BillingState({ token, data }: { token: string; data: PublicBillingView }) {
  if (data.status === 'not_found') {
    return (
      <PaymentCard
        icon={<SearchX className="size-6 text-muted-foreground" aria-hidden />}
        title="Cobrança não encontrada"
      >
        <p className="text-sm text-muted-foreground">
          Confira se o link chegou inteiro. Se o problema continuar, fale com o escritório que
          enviou a cobrança.
        </p>
      </PaymentCard>
    )
  }

  if (data.status === 'unavailable') {
    const contact = data.officeName ?? 'o escritório'
    return (
      <PaymentCard
        icon={<CircleAlert className="size-6 text-muted-foreground" aria-hidden />}
        eyebrow={data.officeName}
        title="Esta cobrança não está disponível"
      >
        <p className="text-sm text-muted-foreground">
          {`Ela foi encerrada ou alterada. Para pagar ou tirar dúvidas, fale com ${contact}.`}
        </p>
        {data.officePhone && (
          <a
            href={`tel:${data.officePhone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Phone className="size-4" aria-hidden />
            {data.officePhone}
          </a>
        )}
      </PaymentCard>
    )
  }

  if (data.status === 'paid') {
    return (
      <PaymentCard
        icon={<CircleCheck className="size-6 text-success" aria-hidden />}
        eyebrow={data.officeName}
        title="Pagamento confirmado"
      >
        <p className="text-sm text-muted-foreground">{data.description}</p>
        {data.paidAmountCents !== null && (
          <p className="text-2xl font-bold tabular-nums">
            {formatCurrency(data.paidAmountCents / 100)}
          </p>
        )}
        {data.paidAt && (
          <p className="text-sm text-muted-foreground">Pago em {formatDate(data.paidAt)}.</p>
        )}
        <ReceiptLink url={data.receiptUrl} />
        <p className="text-xs text-muted-foreground">Não é preciso pagar de novo.</p>
      </PaymentCard>
    )
  }

  return <OpenBilling token={token} data={data} />
}

/** De onde vem o valor do dia, quando o atraso o mudou (migration 97). */
function AmountBreakdown({ data }: { data: Extract<PublicBillingView, { status: 'open' }> }) {
  if (data.lateFeeCents + data.interestCents === 0) return null
  const rows = [
    { key: 'principal', label: 'Valor original', cents: data.principalCents },
    { key: 'fee', label: 'Multa', cents: data.lateFeeCents },
    {
      key: 'interest',
      label: `Juros (${data.daysLate} ${data.daysLate === 1 ? 'dia' : 'dias'})`,
      cents: data.interestCents,
    },
  ].filter((row) => row.key === 'principal' || row.cents > 0)

  return (
    <dl className="space-y-1 rounded-md border px-3 py-2 text-sm">
      {rows.map((row) => (
        <div key={row.key} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="tabular-nums">{formatCurrency(row.cents / 100)}</dd>
        </div>
      ))}
    </dl>
  )
}

function OpenBilling({
  token,
  data,
}: {
  token: string
  data: Extract<PublicBillingView, { status: 'open' }>
}) {
  const checkout = useBillingCheckout(token)
  // Enquanto o navegador sai para o checkout, o botão continua ocupado: um
  // segundo clique só repetiria o mesmo link.
  const leaving = checkout.isPending || checkout.data?.status === 'redirect'
  const overdue = data.dueDate !== null && data.dueDate < todayISO()

  return (
    <PaymentCard
      icon={<CreditCard className="size-6 text-primary" aria-hidden />}
      eyebrow={data.officeName}
      title={data.description}
    >
      <p className="text-3xl font-bold tabular-nums">{formatCurrency(data.amountCents / 100)}</p>
      {data.dueDate && (
        <p className={cn('text-sm', overdue ? 'text-warning' : 'text-muted-foreground')}>
          {overdue ? 'Venceu em ' : 'Vence em '}
          {formatDate(data.dueDate)}
        </p>
      )}
      <AmountBreakdown data={data} />
      {data.pixDiscount && (
        <p className="rounded-md bg-success/12 px-3 py-2 text-sm text-success">
          No Pix,{' '}
          <strong className="tabular-nums">
            {formatCurrency(data.pixDiscount.cents / 100)}
          </strong>{' '}
          ({formatPercent(data.pixDiscount.percent)} de desconto até o vencimento).
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="mt-2 w-full"
        disabled={leaving}
        onClick={() => checkout.mutate()}
      >
        {leaving && <Loader2 className="animate-spin" aria-hidden />}
        {leaving ? 'Abrindo o pagamento…' : 'Pagar com Pix ou cartão'}
      </Button>

      {checkout.isError && (
        <p role="alert" className="text-sm text-destructive">
          {checkout.error.message}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        <Lock className="mr-1 inline size-3 align-[-2px]" aria-hidden />
        O pagamento é feito no checkout da InfinitePay: Pix, ou cartão de crédito em até 12x.
      </p>
    </PaymentCard>
  )
}
