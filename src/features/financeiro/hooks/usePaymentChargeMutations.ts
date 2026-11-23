'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  closeBilling,
  enableRemindersBatch,
  openBilling,
  recordReminder,
  undoReminder,
  updateBilling,
  type BillingChanges,
  type ReminderRecordInput,
} from '../services/billings.service'
import { updateFinancialEntry } from '../services/financialEntries.service'
import {
  PaymentLinkError,
  cancelPaymentLink,
  refundPaymentTransaction,
} from '../services/paymentCharges.service'
import { billingKeys } from './useBillings'
import { financialEntryKeys } from './useFinancialEntries'
import { paymentChargeKeys } from './usePaymentCharges'

/**
 * Avisa a falha de uma rota de cobrança. Quando a InfinitePay aponta onde
 * resolver — conta sem checkout externo ativado —, o aviso leva o atalho.
 */
export function notifyPaymentLinkError(error: unknown, fallback: string): void {
  const message = error instanceof Error && error.message ? error.message : fallback
  const actionUrl = error instanceof PaymentLinkError ? error.actionUrl : null

  toast.error(message, {
    duration: actionUrl ? 15_000 : undefined,
    action: actionUrl
      ? {
          label: 'Ativar na InfinitePay',
          onClick: () => window.open(actionUrl, '_blank', 'noopener,noreferrer'),
        }
      : undefined,
  })
}

/** Cobrança muda o detalhe, a linha da lista (ícone e travas) e o card do
 * dashboard. */
export function useInvalidatePaymentSurfaces() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: paymentChargeKeys.all })
    queryClient.invalidateQueries({ queryKey: billingKeys.all })
    queryClient.invalidateQueries({ queryKey: financialEntryKeys.all })
  }
}

/** Põe a cobrança no ar, ou a religa — o "Gerar link de pagamento". */
export function useOpenBilling() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: ({
      entryId,
      clientDescription,
      reminders,
    }: {
      entryId: string
      clientDescription?: string
      reminders?: boolean
    }) => openBilling(entryId, { clientDescription, reminders }),
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Link de pagamento pronto.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível gerar o link.'),
  })
}

/** Descrição, lembretes, pausa, telefone ou a opção do cliente — o PATCH da
 * cobrança. Quem chama avisa o sucesso: cada mudança tem a sua frase. */
export function useUpdateBilling() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: ({ entryId, changes }: { entryId: string; changes: BillingChanges }) =>
      updateBilling(entryId, changes),
    onSettled: () => invalidate(),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível alterar a cobrança.'),
  })
}

/** Registra o que se fez com o aviso de uma etapa (WhatsApp aberto ou pulado). */
export function useRecordReminder() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (input: ReminderRecordInput) => recordReminder(input),
    onSettled: () => invalidate(),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível registrar o aviso.'),
  })
}

export function useUndoReminder() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (messageId: string) => undoReminder(messageId),
    onSettled: () => invalidate(),
    // Vale para o aviso da régua e para o "mandar de novo": não promete fila.
    onSuccess: () => toast.success('Desfeito: o registro foi apagado.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível desfazer.'),
  })
}

/** Liga os lembretes de vários lançamentos — o lote. */
export function useEnableRemindersBatch() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (entryIds: string[]) => enableRemindersBatch(entryIds),
    onSettled: () => invalidate(),
    onSuccess: (results) => {
      const done = results.filter((result) => result.ok).length
      const failed = results.length - done
      if (done > 0) {
        toast.success(done === 1 ? 'Lembretes ligados em 1 cobrança.' : `Lembretes ligados em ${done} cobranças.`)
      }
      if (failed > 0) {
        const first = results.find((result) => !result.ok)?.error
        toast.error(
          `${failed === 1 ? '1 lançamento ficou' : `${failed} lançamentos ficaram`} de fora` +
            (first ? `: ${first}` : '.'),
        )
      }
    },
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível ligar os lembretes.'),
  })
}

/**
 * "Já pago na InfinitePay": o pagamento existe lá, mas não chegou aqui (o
 * cliente fechou a aba e o aviso se perdeu). Cancela o checkout aberto, se
 * houver — a trava da migration 67 recusa a baixa com link vivo — e dá a baixa
 * manual com a data de hoje.
 */
export function useMarkPaidOutside() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: async ({
      entryId,
      liveChargeId,
    }: {
      entryId: string
      liveChargeId: string | null
    }) => {
      if (liveChargeId) await cancelPaymentLink(liveChargeId)
      await updateFinancialEntry({ id: entryId, status: 'pago' })
    },
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Baixa registrada. A cobrança saiu da régua.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível dar a baixa.'),
  })
}

export function useCloseBilling() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (entryId: string) => closeBilling(entryId),
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Cobrança encerrada.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível encerrar a cobrança.'),
  })
}

export function useCancelPaymentLink() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (chargeId: string) => cancelPaymentLink(chargeId),
    onSettled: () => invalidate(),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível cancelar o link.'),
  })
}

export function useRefundPaymentTransaction() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (transactionId: string) => refundPaymentTransaction(transactionId),
    onSettled: () => invalidate(),
    onSuccess: ({ entryReopened }) =>
      toast.success(
        entryReopened
          ? 'Estorno registrado. O lançamento voltou a pendente.'
          : 'Estorno registrado.',
      ),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível registrar o estorno.'),
  })
}
