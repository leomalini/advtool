'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PortalNeedsDocumentError,
  getPortalData,
  getPortalProcessTimeline,
  verifyPortalDocument,
} from '../services/portal.service'

export const portalKeys = {
  data: (token: string) => ['portal', token] as const,
  timeline: (token: string, processId: string) =>
    ['portal', token, 'processo', processId] as const,
}

/**
 * O andamento do cliente.
 *
 * `retry: false` de propósito: os dois desfechos que não são sucesso aqui —
 * "digite o documento" e "link inválido" — não melhoram com tentativa nova, e
 * repetir a chamada só alimentaria o rate limit do próprio cliente.
 */
export function usePortalData(token: string) {
  return useQuery({
    queryKey: portalKeys.data(token),
    queryFn: () => getPortalData(token),
    retry: false,
    staleTime: 30 * 1000,
  })
}

/**
 * O andamento de um processo. `enabled` amarra a busca à abertura do card —
 * é o que evita baixar a timeline de todos os processos de uma vez.
 *
 * O cache do React Query faz o resto: reabrir um processo já visto não volta
 * ao servidor, então navegar entre os cards é instantâneo depois da primeira
 * abertura.
 */
export function usePortalProcessTimeline(token: string, processId: string | null) {
  return useQuery({
    queryKey: portalKeys.timeline(token, processId ?? ''),
    queryFn: () => getPortalProcessTimeline(token, processId!),
    enabled: Boolean(processId),
    retry: false,
    staleTime: 30 * 1000,
  })
}

export function useVerifyPortalDocument(token: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (document: string) => verifyPortalDocument(token, document),
    onSuccess: () => {
      // O cookie acabou de ser gravado: refazer a consulta é o que troca a tela
      // do formulário para o andamento.
      queryClient.invalidateQueries({ queryKey: portalKeys.data(token) })
    },
  })
}

/** O erro do React Query é `unknown`; isto é o estreitamento que a tela usa
 * para escolher entre o formulário e a mensagem de link inválido. */
export function isNeedsDocument(error: unknown): error is PortalNeedsDocumentError {
  return error instanceof PortalNeedsDocumentError
}
