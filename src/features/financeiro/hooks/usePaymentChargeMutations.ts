'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  PaymentLinkError,
  cancelPaymentLink,
  createPaymentLink,
} from '../services/paymentCharges.service'
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

/** Cobrança muda o detalhe e a linha da lista (ícone e travas). */
function useInvalidatePaymentSurfaces() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: paymentChargeKeys.all })
    queryClient.invalidateQueries({ queryKey: financialEntryKeys.all })
  }
}

export function useCreatePaymentLink() {
  const invalidate = useInvalidatePaymentSurfaces()

  return useMutation({
    mutationFn: (entryId: string) => createPaymentLink(entryId),
    // Também na falha: a cobrança `failed` passa a existir e explica o motivo.
    onSettled: () => invalidate(),
    onSuccess: () => toast.success('Link de pagamento gerado.'),
    onError: (error) => notifyPaymentLinkError(error, 'Não foi possível gerar o link.'),
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
