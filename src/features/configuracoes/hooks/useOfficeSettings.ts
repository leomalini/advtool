'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import type { OfficeSettings, OfficeSettingsInput } from '@/types/officeSettings.types'
import {
  getOfficeSettings,
  removeLetterhead,
  saveInfinitePayHandle,
  saveOfficeSettings,
  uploadLetterhead,
  verifyInfinitePayHandle,
} from '../services/officeSettings.service'

export const officeSettingsKeys = {
  all: ['office_settings'] as const,
}

export function useOfficeSettings() {
  return useQuery({
    queryKey: officeSettingsKeys.all,
    queryFn: getOfficeSettings,
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Todos os fluxos gravam a mesma linha: a resposta já é a linha nova, e vai
 * direto para o cache em vez de pedir de novo. */
function useOfficeMutation<TInput>(
  mutationFn: (input: TInput, userId: string) => Promise<OfficeSettings>,
  messages: { success: string; error: string },
) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: TInput) => {
      if (!user) throw new Error('Sessão expirada. Entre de novo.')
      return mutationFn(input, user.id)
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(officeSettingsKeys.all, settings)
      toast.success(messages.success)
    },
    onError: (error) => toast.error(errorMessage(error, messages.error)),
  })
}

export function useSaveOfficeSettings() {
  return useOfficeMutation(
    (input: OfficeSettingsInput, userId) => saveOfficeSettings(input, userId),
    { success: 'Dados do escritório salvos.', error: 'Erro ao salvar os dados do escritório.' },
  )
}

export function useUploadLetterhead() {
  return useOfficeMutation(
    ({ file, current }: { file: File; current: OfficeSettings | null }, userId) =>
      uploadLetterhead(file, current, userId),
    { success: 'Papel timbrado atualizado.', error: 'Erro ao enviar o papel timbrado.' },
  )
}

export function useRemoveLetterhead() {
  return useOfficeMutation((current: OfficeSettings, userId) => removeLetterhead(current, userId), {
    success: 'Papel timbrado removido.',
    error: 'Erro ao remover o papel timbrado.',
  })
}

export function useSaveInfinitePayHandle() {
  return useOfficeMutation(
    (handle: string | null, userId) => saveInfinitePayHandle(handle, userId),
    { success: 'Conta da InfinitePay salva.', error: 'Erro ao salvar a conta da InfinitePay.' },
  )
}

/** Link de teste para a InfiniteTag. O resultado fica em `data` até a
 * próxima verificação — é ele que a tela mostra. */
export function useVerifyInfinitePayHandle() {
  return useMutation({
    mutationFn: (handle: string) => verifyInfinitePayHandle(handle),
    onError: (error) => toast.error(errorMessage(error, 'Não foi possível verificar a conta.')),
  })
}
