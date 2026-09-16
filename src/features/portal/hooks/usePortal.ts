'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PortalNeedsDocumentError,
  getPortalData,
  verifyPortalDocument,
} from '../services/portal.service'

export const portalKeys = {
  data: (token: string) => ['portal', token] as const,
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
