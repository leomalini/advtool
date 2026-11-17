'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AiSettingsMutationResult, AssistantProvider } from '@/types/aiSettings.types'
import {
  getAiSettings,
  removeAiKey,
  saveAiKey,
  saveAiProvider,
  testAiKey,
} from '../services/aiSettings.service'

export const aiSettingsKeys = {
  all: ['ai_settings'] as const,
}

export function useAiSettings() {
  return useQuery({ queryKey: aiSettingsKeys.all, queryFn: getAiSettings })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * As gravações devolvem `ok: false` quando o provedor recusa (resultado, não
 * erro): a tela mostra a frase ao lado do campo. Com `ok: true`, a resposta já
 * é a aba nova e vai direto para o cache.
 */
function useAiSettingsMutation<TInput>(
  mutationFn: (input: TInput) => Promise<AiSettingsMutationResult>,
  messages: { success: string; error: string },
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      if (!result.ok) return
      queryClient.setQueryData(aiSettingsKeys.all, result.summary)
      toast.success(messages.success)
    },
    onError: (error) => toast.error(errorMessage(error, messages.error)),
  })
}

export function useSaveAiKey() {
  return useAiSettingsMutation(saveAiKey, {
    success: 'Chave testada e salva.',
    error: 'Erro ao salvar a chave.',
  })
}

export function useRemoveAiKey() {
  return useAiSettingsMutation(removeAiKey, {
    success: 'Chave removida do painel.',
    error: 'Erro ao remover a chave.',
  })
}

export function useSaveAiProvider() {
  return useAiSettingsMutation(saveAiProvider, {
    success: 'Assistente atualizado. Vale para todos em até 30 segundos.',
    error: 'Erro ao trocar o provedor.',
  })
}

export function useTestAiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: AssistantProvider) => testAiKey(provider),
    onSuccess: ({ summary }) => queryClient.setQueryData(aiSettingsKeys.all, summary),
    onError: (error) => toast.error(errorMessage(error, 'Erro ao testar a conexão.')),
  })
}
