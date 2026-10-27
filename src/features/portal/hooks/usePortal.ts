'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PortalNeedsDocumentError,
  getPortalAnswers,
  getPortalData,
  getPortalProcessTimeline,
  verifyPortalDocument,
} from '../services/portal.service'

export const portalKeys = {
  data: (token: string) => ['portal', token] as const,
  timeline: (token: string, processId: string) =>
    ['portal', token, 'processo', processId] as const,
  answers: (token: string, processId: string) =>
    ['portal', token, 'processo', processId, 'respostas'] as const,
}

/** Enquanto outra geração do mesmo processo está em curso, pergunta de novo
 * neste intervalo — a resposta sai em segundos. */
const PREPARING_POLL_MS = 4000

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

/**
 * As respostas das perguntas fixas de um processo (fase 3), quando o cliente o
 * escolhe no chat de dúvidas. `preparing` repergunta sozinho a cada 4 s até
 * ficar pronto.
 */
export function usePortalAnswers(token: string, processId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: portalKeys.answers(token, processId ?? ''),
    queryFn: () => getPortalAnswers(token, processId!),
    enabled: enabled && Boolean(processId),
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: (query) =>
      query.state.data?.status === 'preparing' ? PREPARING_POLL_MS : false,
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
