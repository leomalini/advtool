'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createLegalProcess,
  updateLegalProcess,
  deleteLegalProcess,
  addLegalProcessMovement,
} from '../services/legalProcesses.service'
import { legalProcessKeys } from './useLegalProcesses'
import { crmItemKeys } from '@/features/crm/hooks/useCrmItems'
import { useAuth } from '@/hooks/useAuth'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'

function useInvalidateLegalProcesses() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.all })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow('wf-processos') })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
  }
}

export function useCreateLegalProcess() {
  const invalidate = useInvalidateLegalProcesses()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: LegalProcessInput) => createLegalProcess(input, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Processo cadastrado!')
    },
    onError: () => toast.error('Erro ao cadastrar processo.'),
  })
}

export function useUpdateLegalProcess(legalProcessId: string, crmItemId: string) {
  const invalidate = useInvalidateLegalProcesses()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Partial<LegalProcessInput>) =>
      updateLegalProcess(legalProcessId, crmItemId, input, user?.id ?? null),
    onSuccess: () => {
      invalidate()
      toast.success('Processo atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar processo.'),
  })
}

export function useDeleteLegalProcess() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: (id: string) => deleteLegalProcess(id),
    onSuccess: () => {
      invalidate()
      toast.success('Processo removido.')
    },
    onError: () => toast.error('Erro ao remover processo.'),
  })
}

export function useAddLegalProcessMovement(legalProcessId: string) {
  const invalidate = useInvalidateLegalProcesses()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ description, movementDate }: { description: string; movementDate: string }) =>
      addLegalProcessMovement(legalProcessId, description, movementDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalProcessKeys.detail(legalProcessId) })
      invalidate()
      toast.success('Movimentação adicionada!')
    },
    onError: () => toast.error('Erro ao adicionar movimentação.'),
  })
}
