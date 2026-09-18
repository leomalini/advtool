'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteConversation,
  getConversationMessages,
  getConversations,
} from '../services/conversations.service'

export const conversationKeys = {
  all: ['ai_conversations'] as const,
  messages: (id: string) => ['ai_conversations', 'messages', id] as const,
}

export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.all,
    queryFn: getConversations,
  })
}

/** Histórico de uma conversa já existente. Desligado para conversa nova —
 * ela ainda não tem linha no banco. */
export function useConversationMessages(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: conversationKeys.messages(conversationId),
    queryFn: () => getConversationMessages(conversationId),
    enabled,
    // Serve só para hidratar o chat ao abrir a conversa — depois disso o
    // `useChat` é a fonte e ignora novas buscas. Sem cache (gcTime 0): ao
    // voltar para a conversa, a busca é sempre nova, com o último turno.
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all })
      toast.success('Conversa excluída.')
    },
    onError: () => toast.error('Erro ao excluir conversa.'),
  })
}
