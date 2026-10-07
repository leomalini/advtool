'use client'

import { useState } from 'react'
import Link from 'next/link'
import { differenceInMinutes, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  BadgeCheck,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  Receipt,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useCliente } from '@/features/clientes/hooks/useClientes'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import { pickClientPhone } from '@/lib/infinitepay/customer'
import { getClientDisplayName, type ClientWithRelations } from '@/types/cliente.types'
import { formatCurrency, type FinancialEntryWithRelations } from '@/types/financialEntry.types'
import {
  LIVE_CHARGE_STATUSES,
  PAYMENT_CHARGE_STATUS_LABELS,
  describeCaptureMethod,
  type PaymentChargeWithTransactions,
  type PaymentTransaction,
} from '@/types/paymentCharge.types'
import { usePaymentChargesForEntry } from '../hooks/usePaymentCharges'
import { useCancelPaymentLink, useCreatePaymentLink } from '../hooks/usePaymentChargeMutations'
import { buildPaymentMessage, buildWhatsAppUrl } from '../utils/paymentLinkMessage'

/** `creating` há mais que isso travou no meio da geração: oferece cancelar. */
const STUCK_AFTER_MINUTES = 2

const fromCents = (cents: number) => cents / 100

function formatMoment(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/** Pessoa física pelo primeiro nome; empresa pelo nome da tela. */
function greetingName(client: ClientWithRelations | undefined): string | null {
  if (!client) return null
  if (client.type === 'individual') return client.name?.trim().split(/\s+/)[0] || null
  return getClientDisplayName(client) || null
}

/**
 * A cobrança por link de uma receita, no detalhe do lançamento.
 *
 * Mostra o link em aberto (com Copiar, WhatsApp e Abrir), os pagamentos que a
 * InfinitePay confirmou e os links anteriores. Gerar e cancelar passam pelas
 * rotas — a tela não escreve em `payment_charges` (migration 67).
 */
export function PaymentLinkSection({ entry }: { entry: FinancialEntryWithRelations }) {
  const { can } = usePermissions()
  const { data: charges = [], isLoading } = usePaymentChargesForEntry(entry.id)
  const { data: settings } = useOfficeSettings()
  const { data: client } = useCliente(entry.client_id ?? '')
  const createLink = useCreatePaymentLink()
  const cancelLink = useCancelPaymentLink()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const isPending = entry.status === 'pendente'
  // Despesa não se cobra; receita paga à mão, sem link nenhum, não tem o que
  // mostrar aqui. O resumo embutido na lista responde sem esperar a consulta.
  const hasCharges = (entry.payment_charges?.length ?? 0) > 0
  if (entry.type !== 'receita' || (!isPending && !hasCharges)) return null

  const live = charges.find((charge) => LIVE_CHARGE_STATUSES.includes(charge.status)) ?? null
  const withPayments = charges.filter((charge) => charge.transactions.length > 0)
  const history = charges.filter(
    (charge) => charge.id !== live?.id && charge.transactions.length === 0,
  )
  const latest = charges[0] ?? null
  const handle = settings?.infinitepay_handle ?? null
  // Oferecer o link (ou dizer que falta configurar a conta) só faz sentido para
  // quem pode gerar. Sem isso e sem cobrança nenhuma, a seção nem aparece.
  const offersIssue = !live && isPending && can('financeiro', 'create')
  if (!isLoading && !live && withPayments.length === 0 && history.length === 0 && !offersIssue) {
    return null
  }

  function cancel(chargeId: string) {
    cancelLink.mutate(chargeId, {
      onSuccess: () => toast.success('Link cancelado.'),
      onSettled: () => setConfirmingCancel(false),
    })
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <p
        className={cn(
          'flex items-center gap-1.5 text-[10px] uppercase tracking-wide',
          'text-muted-foreground/50',
        )}
      >
        <CreditCard className="h-3 w-3" aria-hidden />
        Cobrança por link
      </p>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <>
          {live?.status === 'creating' && (
            <CreatingCard
              charge={live}
              canCancel={can('financeiro', 'update')}
              canceling={cancelLink.isPending}
              onCancel={() => cancel(live.id)}
            />
          )}

          {live?.status === 'open' && live.checkout_url && (
            <OpenLinkCard
              charge={live}
              url={live.checkout_url}
              greeting={greetingName(client)}
              phone={pickClientPhone(client)}
              canCancel={can('financeiro', 'update')}
              confirmingCancel={confirmingCancel}
              canceling={cancelLink.isPending}
              onAskCancel={() => setConfirmingCancel(true)}
              onKeep={() => setConfirmingCancel(false)}
              onCancel={() => cancel(live.id)}
            />
          )}

          {withPayments.map((charge) =>
            charge.transactions.map((transaction) => (
              <TransactionCard key={transaction.id} charge={charge} transaction={transaction} />
            )),
          )}

          {offersIssue && (
            <div className="space-y-1.5">
              {latest?.status === 'failed' && latest.error && (
                <p className="text-xs text-destructive">
                  A última tentativa falhou: {latest.error}
                </p>
              )}
              {!handle ? (
                <p className="text-xs text-muted-foreground">
                  A conta da InfinitePay ainda não foi configurada.{' '}
                  {can('configuracoes', 'manage') ? (
                    <Link href="/configuracoes?aba=pagamentos" className="underline">
                      Configurar
                    </Link>
                  ) : (
                    'Peça a um administrador: Configurações → Pagamentos.'
                  )}
                </p>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={createLink.isPending}
                    onClick={() => createLink.mutate(entry.id)}
                  >
                    {createLink.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    Gerar link de pagamento
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Pix ou cartão, na conta ${handle}.
                  </p>
                </>
              )}
            </div>
          )}

          {history.length > 0 && <ChargeHistory charges={history} />}
        </>
      )}
    </div>
  )
}

function CreatingCard({
  charge,
  canCancel,
  canceling,
  onCancel,
}: {
  charge: PaymentChargeWithTransactions
  canCancel: boolean
  canceling: boolean
  onCancel: () => void
}) {
  const stuck =
    differenceInMinutes(new Date(), parseISO(charge.created_at)) >= STUCK_AFTER_MINUTES

  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Gerando o link…
      </p>
      {stuck && canCancel && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Está demorando mais que o normal. Se não andar, cancele e gere outro.
          </p>
          <Button type="button" size="xs" variant="ghost" disabled={canceling} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}

function OpenLinkCard({
  charge,
  url,
  greeting,
  phone,
  canCancel,
  confirmingCancel,
  canceling,
  onAskCancel,
  onKeep,
  onCancel,
}: {
  charge: PaymentChargeWithTransactions
  url: string
  greeting: string | null
  phone: string | null
  canCancel: boolean
  confirmingCancel: boolean
  canceling: boolean
  onAskCancel: () => void
  onKeep: () => void
  onCancel: () => void
}) {
  const message = buildPaymentMessage({
    greetingName: greeting,
    description: charge.description,
    amount: fromCents(charge.amount_cents),
    url,
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      // Clipboard bloqueada: o link está no campo, à mão para selecionar.
      toast.error('Não foi possível copiar — selecione o link no campo.')
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="h-3.5 w-3.5 text-info" aria-hidden />
          Link em aberto · {formatCurrency(fromCents(charge.amount_cents))}
        </p>
        <span className="text-[11px] text-muted-foreground">
          gerado em {formatMoment(charge.created_at)}
        </span>
      </div>

      <input
        readOnly
        value={url}
        aria-label="Link de pagamento"
        onFocus={(event) => event.currentTarget.select()}
        className={cn(
          'w-full rounded-md border bg-muted/40 px-2 py-1',
          'font-mono text-[11px] text-muted-foreground',
        )}
      />

      {confirmingCancel ? (
        // Confirmação embutida, sem segundo modal: diálogo dentro do diálogo
        // briga pelo foco (ver PortalLinkDialog).
        <div className="space-y-2 rounded-md bg-destructive/5 p-2.5">
          <p className="text-xs">
            O link deixa de ser oferecido aqui, mas continua pagável para quem já o recebeu: a
            InfinitePay não cancela links. Se o cliente pagar mesmo assim, o pagamento entra com
            alerta.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={canceling}
              onClick={onCancel}
            >
              {canceling && <Loader2 className="animate-spin" />}
              Cancelar link
            </Button>
            <Button type="button" size="xs" variant="ghost" disabled={canceling} onClick={onKeep}>
              Manter
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="xs" variant="outline" onClick={() => void copy()}>
            <Copy />
            Copiar
          </Button>
          <Button type="button" size="xs" variant="outline" asChild>
            <a href={buildWhatsAppUrl(phone, message)} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              WhatsApp
            </a>
          </Button>
          <Button type="button" size="xs" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              Abrir
            </a>
          </Button>
          {canCancel && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onAskCancel}
            >
              <XCircle />
              Cancelar link
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function TransactionCard({
  charge,
  transaction,
}: {
  charge: PaymentChargeWithTransactions
  transaction: PaymentTransaction
}) {
  // Valor de um link clonado com o mesmo `order_nsu`: pagamento real, mas não
  // o desta cobrança — não dá baixa (ver "O que o spike mostrou" no plano).
  const divergent = transaction.amount_cents !== charge.amount_cents
  const installments = transaction.installments ?? 1

  return (
    <div
      className={cn(
        'space-y-1 rounded-lg border p-3',
        divergent ? 'border-warning/40 bg-warning/5' : 'border-success/30 bg-success/5',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-medium',
          divergent ? 'text-warning' : 'text-success',
        )}
      >
        {divergent ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
        )}
        Pago via {describeCaptureMethod(transaction.capture_method)}
        {installments > 1 ? ` em ${installments}x` : ''} ·{' '}
        {formatCurrency(fromCents(transaction.amount_cents))}
      </p>
      <p className="text-xs text-muted-foreground">
        Confirmado em {formatMoment(transaction.confirmed_at)}
      </p>
      {divergent && (
        <p className="text-xs text-warning">
          Valor diferente do cobrado ({formatCurrency(fromCents(charge.amount_cents))}): o
          lançamento não recebeu baixa. Confira no app da InfinitePay.
        </p>
      )}
      {transaction.paid_amount_cents > transaction.amount_cents && (
        <p className="text-xs text-muted-foreground">
          O cliente pagou {formatCurrency(fromCents(transaction.paid_amount_cents))} com os juros
          do parcelamento.
        </p>
      )}
      {transaction.refunded_at && (
        <p className="text-xs text-muted-foreground">
          Estorno registrado em {formatMoment(transaction.refunded_at)}.
        </p>
      )}
      {transaction.receipt_url && (
        <a
          href={transaction.receipt_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Receipt className="h-3 w-3" aria-hidden />
          Comprovante
        </a>
      )}
    </div>
  )
}

function ChargeHistory({ charges }: { charges: PaymentChargeWithTransactions[] }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {charges.length === 1 ? '1 link anterior' : `${charges.length} links anteriores`}
      </summary>
      <ul className="mt-1.5 space-y-1 pl-3">
        {charges.map((charge) => (
          <li key={charge.id}>
            {formatMoment(charge.created_at)} — {PAYMENT_CHARGE_STATUS_LABELS[charge.status]},{' '}
            {formatCurrency(fromCents(charge.amount_cents))}
            {charge.status === 'failed' && charge.error ? `: ${charge.error}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}
