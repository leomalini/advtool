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
  Eye,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Pencil,
  Receipt,
  Undo2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { useCliente } from '@/features/clientes/hooks/useClientes'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import { pickClientPhone } from '@/lib/infinitepay/customer'
import {
  CLIENT_DESCRIPTION_MAX,
  MIN_BILLING_AMOUNT_CENTS,
  defaultClientDescription,
  type Billing,
} from '@/types/billing.types'
import { getClientDisplayName, type ClientWithRelations } from '@/types/cliente.types'
import { formatCurrency, type FinancialEntryWithRelations } from '@/types/financialEntry.types'
import {
  PAYMENT_CHARGE_STATUS_LABELS,
  describeCaptureMethod,
  isChargeLive,
  type PaymentChargeWithTransactions,
  type PaymentTransaction,
} from '@/types/paymentCharge.types'
import { useBillingForEntry } from '../hooks/useBillings'
import { usePaymentChargesForEntry } from '../hooks/usePaymentCharges'
import {
  useCancelPaymentLink,
  useCloseBilling,
  useOpenBilling,
  useRefundPaymentTransaction,
  useUpdateBilling,
} from '../hooks/usePaymentChargeMutations'
import { buildPaymentMessage, buildWhatsAppUrl } from '../utils/paymentLinkMessage'
import { BillingReminders } from './BillingReminders'

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
 * O link que o escritório manda é o da página da cobrança (`/pagar/<token>`,
 * migration 95): o checkout da InfinitePay só nasce quando o cliente clica em
 * "Pagar". Aqui ficam esse link (Copiar, WhatsApp, Abrir, Encerrar), o que o
 * cliente já fez com ele, os pagamentos que a InfinitePay confirmou e os links
 * anteriores. Tudo passa por rota — a tela não escreve em `billings` nem em
 * `payment_charges`.
 *
 * Um link da InfinitePay de antes da página, ainda vivo e sem cobrança no ar,
 * continua aparecendo como era.
 */
export function PaymentLinkSection({ entry }: { entry: FinancialEntryWithRelations }) {
  const { can } = usePermissions()
  const isIncome = entry.type === 'receita'
  const isPending = entry.status === 'pendente'
  // Despesa não se cobra; receita paga à mão, sem link nenhum, não tem o que
  // mostrar aqui. O resumo embutido na lista responde sem esperar a consulta.
  const hasCharges = (entry.payment_charges?.length ?? 0) > 0
  const { data: charges = [], isLoading: chargesLoading } = usePaymentChargesForEntry(entry.id)
  const {
    data: billingData,
    isLoading: billingLoading,
    isError: billingFailed,
  } = useBillingForEntry(isIncome && (isPending || hasCharges) ? entry.id : null)
  const { data: settings } = useOfficeSettings()
  const { data: client } = useCliente(entry.client_id ?? '')
  const cancelLink = useCancelPaymentLink()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // Nor does one under R$ 1,00 — a success fee to assess, at R$ 0: the
  // InfinitePay refuses it, and the section would flash its loading state.
  const chargeable =
    isPending && Math.round(Number(entry.amount) * 100) >= MIN_BILLING_AMOUNT_CENTS
  if (!isIncome || (!chargeable && !hasCharges)) return null

  const isLoading = chargesLoading || billingLoading
  const billing = billingData?.billing ?? null
  const activeBilling = billing && !billing.canceled_at ? billing : null
  const billingUrl = billingData?.url ?? null
  const showBilling = isPending && activeBilling !== null && billingUrl !== null

  const now = new Date()
  const live = charges.find((charge) => isChargeLive(charge, now)) ?? null
  const withPayments = charges.filter((charge) => charge.transactions.length > 0)
  const history = charges.filter(
    (charge) => charge.id !== live?.id && charge.transactions.length === 0,
  )
  const latest = charges[0] ?? null
  const handle = settings?.infinitepay_handle ?? null
  // Link da InfinitePay vivo sem página no ar: o de antes da migration 95.
  const legacyLive = showBilling ? null : live
  // Oferecer o link (ou dizer que falta configurar a conta) só faz sentido para
  // quem pode gerar. Sem isso e sem cobrança nenhuma, a seção nem aparece. Se
  // a cobrança não carregou, não dá para saber se já existe: avisa, não oferece.
  const offersIssue =
    chargeable && !billingFailed && !activeBilling && !legacyLive && can('financeiro', 'create')
  const showBillingFailure = billingFailed && isPending
  if (
    !isLoading &&
    !showBilling &&
    !showBillingFailure &&
    !legacyLive &&
    withPayments.length === 0 &&
    history.length === 0 &&
    !offersIssue
  ) {
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
          {showBillingFailure && (
            <p className="text-xs text-destructive">
              Não foi possível carregar o link de pagamento. Feche e abra o lançamento de novo.
            </p>
          )}

          {showBilling && activeBilling && billingUrl && (
            <BillingCard
              entry={entry}
              billing={activeBilling}
              url={billingUrl}
              liveCharge={live}
              lastFailure={latest?.status === 'failed' ? latest.error : null}
              greeting={greetingName(client)}
              phone={pickClientPhone(client)}
              canUpdate={can('financeiro', 'update')}
            />
          )}

          {showBilling && billingData?.item && (
            <BillingReminders
              item={billingData.item}
              officeName={billingData.officeName}
              officePhone={billingData.officePhone}
              canUpdate={can('financeiro', 'update')}
            />
          )}

          {legacyLive?.status === 'creating' && (
            <CreatingCard
              charge={legacyLive}
              canCancel={can('financeiro', 'update')}
              canceling={cancelLink.isPending}
              onCancel={() => cancel(legacyLive.id)}
            />
          )}

          {legacyLive?.status === 'open' && legacyLive.checkout_url && (
            <OpenLinkCard
              charge={legacyLive}
              url={legacyLive.checkout_url}
              greeting={greetingName(client)}
              phone={pickClientPhone(client)}
              canCancel={can('financeiro', 'update')}
              confirmingCancel={confirmingCancel}
              canceling={cancelLink.isPending}
              onAskCancel={() => setConfirmingCancel(true)}
              onKeep={() => setConfirmingCancel(false)}
              onCancel={() => cancel(legacyLive.id)}
            />
          )}

          {withPayments.map((charge) =>
            charge.transactions.map((transaction) => (
              <TransactionCard key={transaction.id} charge={charge} transaction={transaction} />
            )),
          )}

          {offersIssue &&
            (!handle ? (
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
              <BillingIssueForm entry={entry} handle={handle} closedBilling={billing} />
            ))}

          {history.length > 0 && <ChargeHistory charges={history} />}
        </>
      )}
    </div>
  )
}

function formatShortMoment(iso: string): string {
  return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR })
}

/** Gerar (ou religar) o link: com a descrição que o cliente vai ler. */
function BillingIssueForm({
  entry,
  handle,
  closedBilling,
}: {
  entry: FinancialEntryWithRelations
  handle: string
  /** A cobrança encerrada, se houver: religar mantém o endereço. */
  closedBilling: Billing | null
}) {
  const openBilling = useOpenBilling()
  const [description, setDescription] = useState(
    closedBilling?.client_description ?? defaultClientDescription(entry),
  )
  const fieldId = `billing-description-${entry.id}`
  // A régua conta do vencimento: sem ele, a opção nem aparece.
  const canRemind = entry.settlement_kind === 'scheduled' && !!entry.due_date
  const [reminders, setReminders] = useState(canRemind)

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={fieldId} className="text-xs text-muted-foreground">
          Como o cliente vê
        </label>
        <Input
          id={fieldId}
          value={description}
          maxLength={CLIENT_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
          className="h-8 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Aparece na página, na mensagem e no checkout. Evite citar o processo.
        </p>
      </div>
      {canRemind && (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={reminders}
            onCheckedChange={(checked) => setReminders(checked === true)}
          />
          Cobrar automaticamente: lembretes ao cliente nos dias da régua
        </label>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={openBilling.isPending || !description.trim()}
        onClick={() =>
          openBilling.mutate({
            entryId: entry.id,
            clientDescription: description,
            reminders: canRemind && reminders,
          })
        }
      >
        {openBilling.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
        {closedBilling ? 'Reativar o link de pagamento' : 'Gerar link de pagamento'}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        {closedBilling
          ? 'O mesmo endereço enviado antes volta a valer.'
          : `Pix ou cartão, na conta $${handle}. O checkout só é gerado quando o cliente clica ` +
            'em Pagar, com o valor do dia.'}
      </p>
    </div>
  )
}

/** A cobrança no ar: o link que se manda, o que o cliente já fez com ele e o
 * encerramento. */
function BillingCard({
  entry,
  billing,
  url,
  liveCharge,
  lastFailure,
  greeting,
  phone,
  canUpdate,
}: {
  entry: FinancialEntryWithRelations
  billing: Billing
  url: string
  /** O checkout da InfinitePay ainda pagável, se o cliente já abriu um. */
  liveCharge: PaymentChargeWithTransactions | null
  /** Por que a última tentativa de abrir o checkout falhou. */
  lastFailure: string | null
  greeting: string | null
  phone: string | null
  canUpdate: boolean
}) {
  const closeBilling = useCloseBilling()
  const updateDescription = useUpdateBilling()
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(billing.client_description)
  const amount = Number(entry.amount)

  const message = buildPaymentMessage({
    greetingName: greeting,
    description: billing.client_description,
    amount,
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

  function saveDescription() {
    updateDescription.mutate(
      { entryId: entry.id, changes: { clientDescription: draft } },
      {
        onSuccess: () => {
          setEditing(false)
          toast.success('Descrição trocada.')
        },
      },
    )
  }

  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="h-3.5 w-3.5 text-info" aria-hidden />
          Link de pagamento · {formatCurrency(amount)}
        </p>
        <span className="text-[11px] text-muted-foreground">
          criado em {formatMoment(billing.created_at)}
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

      {editing ? (
        <div className="space-y-1.5">
          <Input
            value={draft}
            maxLength={CLIENT_DESCRIPTION_MAX}
            aria-label="Como o cliente vê"
            onChange={(event) => setDraft(event.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              disabled={updateDescription.isPending || !draft.trim()}
              onClick={saveDescription}
            >
              {updateDescription.isPending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={updateDescription.isPending}
              onClick={() => {
                setDraft(billing.client_description)
                setEditing(false)
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs">
          <span className="text-muted-foreground">Como o cliente vê: </span>
          {billing.client_description}
          {canUpdate && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Editar como o cliente vê"
              className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </p>
      )}

      <ul className="space-y-0.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Eye className="h-3 w-3" aria-hidden />
          {billing.viewed_at
            ? `Aberto pelo cliente em ${formatShortMoment(billing.viewed_at)}` +
              (billing.last_viewed_at && billing.last_viewed_at !== billing.viewed_at
                ? `; última vez em ${formatShortMoment(billing.last_viewed_at)}`
                : '')
            : 'Ainda não aberto pelo cliente.'}
        </li>
        {billing.checkout_clicked_at && (
          <li className="flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3" aria-hidden />
            Foi ao pagamento em {formatShortMoment(billing.checkout_clicked_at)}
            {liveCharge?.status === 'open' &&
              (liveCharge.expires_at
                ? `; checkout aberto até ${formatShortMoment(liveCharge.expires_at)}`
                : '; checkout aberto, sem validade')}
          </li>
        )}
        {lastFailure && (
          <li className="text-destructive">
            A última tentativa de abrir o checkout falhou: {lastFailure}
          </li>
        )}
      </ul>

      {confirmingClose ? (
        // Confirmação embutida, sem segundo modal: diálogo dentro do diálogo
        // briga pelo foco (ver PortalLinkDialog).
        <div className="space-y-2 rounded-md bg-destructive/5 p-2.5">
          <p className="text-xs">
            A página passa a dizer ao cliente que a cobrança não está disponível. Quem já abriu o
            checkout da InfinitePay ainda consegue pagar até ele vencer, e esse pagamento entra
            com alerta. Gerar de novo religa o mesmo endereço.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={closeBilling.isPending}
              onClick={() =>
                closeBilling.mutate(entry.id, { onSettled: () => setConfirmingClose(false) })
              }
            >
              {closeBilling.isPending && <Loader2 className="animate-spin" />}
              Encerrar cobrança
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={closeBilling.isPending}
              onClick={() => setConfirmingClose(false)}
            >
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
          {canUpdate && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmingClose(true)}
            >
              <XCircle />
              Encerrar
            </Button>
          )}
        </div>
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
  const { can } = usePermissions()
  const refund = useRefundPaymentTransaction()
  const [confirmingRefund, setConfirmingRefund] = useState(false)

  // Valor de um link clonado com o mesmo `order_nsu`: pagamento real, mas não
  // o desta cobrança — não dá baixa (ver "O que o spike mostrou" no plano).
  const divergent = transaction.amount_cents !== charge.amount_cents
  // Cancelado e pago assim mesmo: a baixa ficou para o escritório decidir.
  const paidAfterCancel = !divergent && charge.canceled_at !== null
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
      {paidAfterCancel && (
        <p className="text-xs text-warning">
          O link tinha sido cancelado quando foi pago: a baixa não foi automática. Decida entre
          estorno e baixa manual.
        </p>
      )}
      {transaction.refunded_at && (
        <p className="text-xs text-muted-foreground">
          Estorno registrado em {formatMoment(transaction.refunded_at)}.
        </p>
      )}

      {confirmingRefund ? (
        // Confirmação embutida, como a do cancelamento: sem segundo modal.
        <div className="space-y-2 rounded-md bg-destructive/5 p-2.5">
          <p className="text-xs">
            Registre só depois de estornar no app da InfinitePay — o sistema não estorna, só
            anota. Se este pagamento tinha dado baixa, o lançamento volta a pendente.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              disabled={refund.isPending}
              onClick={() =>
                refund.mutate(transaction.id, { onSettled: () => setConfirmingRefund(false) })
              }
            >
              {refund.isPending && <Loader2 className="animate-spin" />}
              Registrar estorno
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={refund.isPending}
              onClick={() => setConfirmingRefund(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
          {!transaction.refunded_at && can('financeiro', 'update') && (
            <button
              type="button"
              onClick={() => setConfirmingRefund(true)}
              className={cn(
                'inline-flex items-center gap-1 text-xs text-muted-foreground',
                'hover:text-destructive',
              )}
            >
              <Undo2 className="h-3 w-3" aria-hidden />
              Registrar estorno
            </button>
          )}
        </div>
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
