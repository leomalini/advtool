'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BadgeCheck, CreditCard, ExternalLink, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, todayISO } from '@/types/financialEntry.types'
import { describeCaptureMethod } from '@/types/paymentCharge.types'
import type { PortalPayment } from '@/types/clientPortal.types'

type OpenPayment = Extract<PortalPayment, { status: 'open' }>
type PaidPayment = Extract<PortalPayment, { status: 'paid' }>

function day(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
}

/**
 * As cobranças em aberto, no topo da página: é o que o cliente precisa
 * resolver. O pagamento acontece no checkout da InfinitePay — o botão só leva
 * até lá, numa aba nova, e a volta cai em `/pagamento/retorno`.
 *
 * `null` (não carregou) vira um aviso curto: o portal continua de pé com os
 * processos, e o cliente não conclui que não deve nada.
 */
export function PortalOpenPayments({ payments }: { payments: PortalPayment[] | null }) {
  if (payments === null) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Não foi possível carregar os pagamentos agora. Tente recarregar a página.
      </p>
    )
  }

  const open = payments.filter((payment): payment is OpenPayment => payment.status === 'open')
  if (open.length === 0) return null

  const today = todayISO()

  return (
    <section aria-labelledby="portal-pagamentos-abertos" className="flex flex-col gap-2">
      <h2
        id="portal-pagamentos-abertos"
        className="flex items-center gap-1.5 text-sm font-semibold"
      >
        <CreditCard className="size-4 text-muted-foreground" aria-hidden />
        {open.length === 1 ? 'Pagamento em aberto' : 'Pagamentos em aberto'}
      </h2>

      {open.map((payment) => {
        const overdue = payment.due_date !== null && payment.due_date < today
        return (
          <div
            key={payment.id}
            className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{payment.description}</p>
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrency(payment.amount_cents / 100)}
              </p>
              <p
                className={cn(
                  'text-xs',
                  overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {payment.due_date
                  ? `${overdue ? 'Venceu' : 'Vence'} em ${day(payment.due_date)}`
                  : 'Sem data de vencimento'}
              </p>
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <Button asChild className="w-full sm:w-auto">
                <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer">
                  Pagar
                  <ExternalLink aria-hidden />
                </a>
              </Button>
              <p className="text-[11px] text-muted-foreground">Pix ou cartão, pela InfinitePay</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/**
 * O que já foi pago, com o comprovante — embaixo, depois dos processos: é
 * consulta, não pendência. Some quando não há nenhum.
 */
export function PortalPaidPayments({ payments }: { payments: PortalPayment[] | null }) {
  const paid = (payments ?? []).filter(
    (payment): payment is PaidPayment => payment.status === 'paid',
  )
  if (paid.length === 0) return null

  return (
    <section aria-labelledby="portal-pagamentos-feitos" className="flex flex-col gap-2">
      <h2 id="portal-pagamentos-feitos" className="text-sm font-semibold">
        Pagamentos realizados
      </h2>
      <ul className="divide-y rounded-xl border">
        {paid.map((payment) => {
          const installments =
            (payment.installments ?? 1) > 1 ? ` em ${payment.installments}x` : ''
          return (
            <li key={payment.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{payment.description}</p>
                <p className="text-xs text-muted-foreground">
                  {`Pago em ${day(payment.paid_at)} via `}
                  {`${describeCaptureMethod(payment.capture_method)}${installments}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-medium tabular-nums">
                  {formatCurrency(payment.paid_amount_cents / 100)}
                </span>
                {payment.receipt_url && (
                  <a
                    href={payment.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Receipt className="size-3" aria-hidden />
                    Comprovante
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
