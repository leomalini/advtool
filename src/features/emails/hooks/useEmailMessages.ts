'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getChargeEmailMessages,
  getClientEmailMessages,
  getEmailConfigured,
  getEmailMessageContent,
  getRecentEmailMessages,
} from '../services/emailMessages.service'

/** Tudo sob `['email_messages']`: um envio invalida as listas de uma vez. O
 * conteúdo (`content`) não muda depois de enviado e fica fora da invalidação. */
export const emailMessageKeys = {
  all: ['email_messages'] as const,
  byClient: (clientId: string) => ['email_messages', 'client', clientId] as const,
  byCharge: (chargeId: string) => ['email_messages', 'charge', chargeId] as const,
  recent: () => ['email_messages', 'recent'] as const,
  content: (id: string) => ['email_message_content', id] as const,
  configured: ['email_configured'] as const,
}

export function useChargeEmailMessages(chargeId: string) {
  return useQuery({
    queryKey: emailMessageKeys.byCharge(chargeId),
    queryFn: () => getChargeEmailMessages(chargeId),
  })
}

/** Muda só com novo deploy (variáveis de ambiente): uma consulta por sessão. */
export function useEmailConfigured() {
  return useQuery({
    queryKey: emailMessageKeys.configured,
    queryFn: getEmailConfigured,
    staleTime: Infinity,
  })
}

export function useClientEmailMessages(clientId: string) {
  return useQuery({
    queryKey: emailMessageKeys.byClient(clientId),
    queryFn: () => getClientEmailMessages(clientId),
  })
}

export function useRecentEmailMessages() {
  return useQuery({
    queryKey: emailMessageKeys.recent(),
    queryFn: () => getRecentEmailMessages(),
  })
}

export function useEmailMessageContent(id: string | null) {
  return useQuery({
    queryKey: emailMessageKeys.content(id ?? ''),
    queryFn: () => getEmailMessageContent(id!),
    enabled: id !== null,
    staleTime: Infinity,
  })
}
