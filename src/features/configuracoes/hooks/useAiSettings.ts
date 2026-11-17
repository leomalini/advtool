'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AiSettingsMutationResult, AssistantProvider } from '@/types/aiSettings.types'
import {
  getAiMonthUsage,
  getAiSettings,
  getAiSettingsLog,
  removeAiKey,
  saveAiBudget,
  saveAiFeature,
  saveAiKey,
  saveAiProvider,
  testAiKey,
} from '../services/aiSettings.service'

export const aiSettingsKeys = {
  all: ['ai_settings'] as const,
  usage: ['ai_settings', 'usage'] as const,
  log: ['ai_settings', 'log'] as const,
}

export function useAiSettings() {
  return useQuery({ queryKey: aiSettingsKeys.all, queryFn: getAiSettings })
}

export function useAiMonthUsage() {
  return useQuery({ queryKey: aiSettingsKeys.usage, queryFn: getAiMonthUsage })
}

export function useAiSettingsLog() {
  return useQuery({ queryKey: aiSettingsKeys.log, queryFn: getAiSettingsLog })
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
      // Toda gravação vira uma linha no histórico.
      void queryClient.invalidateQueries({ queryKey: aiSettingsKeys.log })
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
    onSuccess: ({ summary }) => {
      queryClient.setQueryData(aiSettingsKeys.all, summary)
      void queryClient.invalidateQueries({ queryKey: aiSettingsKeys.log })
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao testar a conexão.')),
  })
}

export function useSaveAiBudget() {
  return useAiSettingsMutation(saveAiBudget, {
    success: 'Teto atualizado.',
    error: 'Erro ao salvar o teto.',
  })
}

export function useSaveAiFeature() {
  return useAiSettingsMutation(saveAiFeature, {
    success: 'Função atualizada. Vale para todos em até 30 segundos.',
    error: 'Erro ao mudar a função.',
  })
}
