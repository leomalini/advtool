'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { closeBilling, openBilling, updateBillingDescription } from '../services/billings.service'
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
    mutationFn: ({ entryId, clientDescription }: { entryId: string; clientDescription?: string }) =>
      openBilling(entryId, clientDescription),
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Link de pagamento pronto.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível gerar o link.'),
  })
}

export function useUpdateBillingDescription() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: ({ entryId, clientDescription }: { entryId: string; clientDescription: string }) =>
      updateBillingDescription(entryId, clientDescription),
    onSettled: () => invalidate(),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível trocar a descrição.'),
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
