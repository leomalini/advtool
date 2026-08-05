'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
} from '../services/financialEntries.service'
import { financialEntryKeys } from './useFinancialEntries'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { useAuth } from '@/hooks/useAuth'
import type {
  FinancialEntryInput,
  UpdateFinancialEntryInput,
} from '@/schemas/financialEntry.schema'

/** Toda superfície que mostra dado financeiro — mesma forma dos invalidadores
 * de evento e tarefa. */
export function useInvalidateFinancialSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefixo — alcança forEntity, summary e cashFlow.
    queryClient.invalidateQueries({ queryKey: financialEntryKeys.all })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
  }
}

export function useCreateFinancialEntry() {
  const invalidate = useInvalidateFinancialSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: FinancialEntryInput) => createFinancialEntry(input, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Lançamento registrado!')
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })
}

export function useUpdateFinancialEntry() {
  const invalidate = useInvalidateFinancialSurfaces()

  return useMutation({
    mutationFn: (input: UpdateFinancialEntryInput) => updateFinancialEntry(input),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao atualizar lançamento.'),
  })
}

export function useDeleteFinancialEntry() {
  const invalidate = useInvalidateFinancialSurfaces()

  return useMutation({
    mutationFn: (id: string) => deleteFinancialEntry(id),
    onSuccess: () => {
      invalidate()
      toast.success('Lançamento removido.')
    },
    onError: () => toast.error('Erro ao remover lançamento.'),
  })
}
