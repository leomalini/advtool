'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useInvalidateContractSurfaces } from '@/features/contratos/hooks/useContractMutations'
import type { SendForSignatureInput } from '@/schemas/signature.schema'
import type { DocumentRecord } from '@/types/document.types'
import { buildSignatureSeals } from '@/types/signature.types'
import {
  cancelSignature,
  changeSignatureEmail,
  getContractSignatureRequests,
  getDocumentSignatureRequests,
  getDocumentSignerClients,
  getSignatureAvailability,
  getSignatureSealRows,
  refreshSignature,
  resendSignatureLink,
  retrySignature,
  sendForSignature,
} from '../services/signatures.service'

/** Tudo sob ['signatures']: uma invalidação alcança seção, selos e diálogos. */
export const signatureKeys = {
  all: ['signatures'] as const,
  contract: (id: string) => ['signatures', 'contract', id] as const,
  document: (id: string) => ['signatures', 'document', id] as const,
  seals: ['signatures', 'seals'] as const,
  availability: ['signatures', 'availability'] as const,
  signerClients: (documentId: string) => ['signatures', 'signer-clients', documentId] as const,
}

/** Os envios do contrato. Desligado quando a D4Sign não está configurada —
 * sem a migration 79, a consulta falharia. */
export function useContractSignatures(contractId: string, enabled: boolean) {
  return useQuery({
    queryKey: signatureKeys.contract(contractId),
    queryFn: () => getContractSignatureRequests(contractId),
    enabled: enabled && !!contractId,
  })
}

/** Os envios de um arquivo avulso, para o diálogo do selo. */
export function useDocumentSignatures(documentId: string | null) {
  return useQuery({
    queryKey: signatureKeys.document(documentId ?? '-'),
    queryFn: () => getDocumentSignatureRequests(documentId as string),
    enabled: !!documentId,
  })
}

/**
 * Se dá para enviar: a D4Sign configurada no servidor. Não muda com a tela
 * aberta — uma consulta por sessão.
 */
export function useSignatureAvailability() {
  return useQuery({
    queryKey: signatureKeys.availability,
    queryFn: getSignatureAvailability,
    staleTime: Infinity,
    retry: false,
  })
}

/** Arquivo → selo, para as listas de Documentos. Sem a D4Sign, nem consulta. */
export function useSignatureSeals(enabled: boolean) {
  return useQuery({
    queryKey: signatureKeys.seals,
    queryFn: getSignatureSealRows,
    select: buildSignatureSeals,
    enabled,
    // Sem a migration 79 a tabela não existe: o selo some, a lista fica.
    retry: false,
  })
}

/** O cliente do arquivo, do caso e do processo — a lista inicial do envio. */
export function useDocumentSignerClients(
  document: Pick<DocumentRecord, 'id' | 'client_id' | 'crm_item_id' | 'legal_process_id'> | null,
) {
  return useQuery({
    queryKey: signatureKeys.signerClients(document?.id ?? '-'),
    queryFn: () => getDocumentSignerClients(document as NonNullable<typeof document>),
    enabled: !!document,
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Todo envio mexe no próprio envio e no dono do arquivo (o status do contrato,
 * a cópia assinada nos Documentos): invalida tudo mesmo quando falha — o envio
 * que parou num passo aparece com "Tentar de novo".
 */
function useSignatureMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  messages: { success: string | ((result: TResult) => string); error: string },
) {
  const queryClient = useQueryClient()
  const invalidateContract = useInvalidateContractSurfaces()

  return useMutation({
    mutationFn,
    onSuccess: (result) =>
      toast.success(
        typeof messages.success === 'function' ? messages.success(result) : messages.success,
      ),
    onError: (error) => toast.error(errorMessage(error, messages.error)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: signatureKeys.all })
      // Contratos, documentos e o compromisso do vencimento.
      invalidateContract()
    },
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
