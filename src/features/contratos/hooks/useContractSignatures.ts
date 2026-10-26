'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { SendForSignatureInput } from '@/schemas/signature.schema'
import {
  cancelSignature,
  changeSignatureEmail,
  getContractSignatureRequests,
  refreshSignature,
  resendSignatureLink,
  retrySignature,
  sendForSignature,
} from '../services/signatures.service'
import { useInvalidateContractSurfaces } from './useContractMutations'
import { contractKeys } from './useContracts'

/** Os envios do contrato. Desligado quando a D4Sign não está configurada —
 * sem a migration 79, a consulta falharia. */
export function useContractSignatures(contractId: string, enabled: boolean) {
  return useQuery({
    queryKey: contractKeys.signatures(contractId),
    queryFn: () => getContractSignatureRequests(contractId),
    enabled: enabled && !!contractId,
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Todo envio mexe no contrato (status, arquivo assinado) e no próprio envio:
 * invalida as duas coisas mesmo quando falha — o envio que parou num passo
 * aparece na seção com "Tentar de novo".
 */
function useSignatureMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  messages: { success: string | ((result: TResult) => string); error: string },
) {
  const invalidate = useInvalidateContractSurfaces()

  return useMutation({
    mutationFn,
    onSuccess: (result) =>
      toast.success(
        typeof messages.success === 'function' ? messages.success(result) : messages.success,
      ),
    onError: (error) => toast.error(errorMessage(error, messages.error)),
    // Prefixo ['contracts']: alcança a seção, o detalhe e o histórico.
    onSettled: () => invalidate(),
  })
}

export function useSendForSignature() {
  return useSignatureMutation((input: SendForSignatureInput) => sendForSignature(input), {
    success: ({ request }) =>
      `Enviado para assinatura. A D4Sign avisa ${request.signers.length === 1 ? 'quem assina' : `as ${request.signers.length} pessoas`} por e-mail.`,
    error: 'Não foi possível enviar para assinatura.',
  })
}

export function useRetrySignature() {
  return useSignatureMutation((id: string) => retrySignature(id), {
    success: 'Envio retomado: o documento está em assinatura.',
    error: 'Não foi possível retomar o envio.',
  })
}

export function useCancelSignature() {
  return useSignatureMutation(
    ({ id, reason }: { id: string; reason: string | null }) => cancelSignature(id, reason),
    { success: 'Envio cancelado.', error: 'Não foi possível cancelar o envio.' },
  )
}

export function useRefreshSignature() {
  return useSignatureMutation((id: string) => refreshSignature(id), {
    success: ({ outcome }) => outcome.reason ?? 'Status atualizado.',
    error: 'Não foi possível consultar a D4Sign.',
  })
}

export function useResendSignatureLink() {
  return useSignatureMutation(
    ({ id, signerId }: { id: string; signerId: string }) => resendSignatureLink(id, signerId),
    { success: 'Link reenviado.', error: 'Não foi possível reenviar o link.' },
  )
}

export function useChangeSignatureEmail() {
  return useSignatureMutation(
    ({ id, signerId, email }: { id: string; signerId: string; email: string }) =>
      changeSignatureEmail(id, signerId, email),
    { success: 'E-mail trocado. Reenvie o link se precisar.', error: 'Não foi possível trocar o e-mail.' },
  )
}
