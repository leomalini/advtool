'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  attachFilesToFinancialEntry,
  createFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
} from '../services/financialEntries.service'
import { financialEntryKeys } from './useFinancialEntries'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { useAuth } from '@/hooks/useAuth'
import type {
  FinancialEntryInput,
  UpdateFinancialEntryInput,
} from '@/schemas/financialEntry.schema'
import type { PendingAttachments } from '@/types/document.types'

/** Toda superfície que mostra dado financeiro — mesma forma dos invalidadores
 * de evento e tarefa. */
export function useInvalidateFinancialSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefixo — alcança forEntity, summary e cashFlow.
    queryClient.invalidateQueries({ queryKey: financialEntryKeys.all })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
    // Anexos entram com o lançamento e saem com ele (cascade, migration 63).
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
  }
}

/** Avisa o que foi anexado — o lançamento em si já foi salvo e tem o próprio
 * toast. */
function reportAttachments(total: number, failed: number) {
  if (total === 0) return
  if (failed === 0) {
    toast.success(total === 1 ? 'Documento anexado!' : `${total} documentos anexados!`)
  } else {
    toast.error(
      failed === total
        ? 'O lançamento foi salvo, mas os documentos não foram anexados.'
        : `O lançamento foi salvo, mas ${failed} de ${total} documentos não foram anexados.`
    )
  }
}

export function useCreateFinancialEntry() {
  const invalidate = useInvalidateFinancialSurfaces()
  const { user } = useAuth()

  return useMutation({
    // `attachments`: escolhidos no formulário antes de o lançamento existir —
    // sobem logo depois de ele ser criado.
    mutationFn: async ({
      attachments,
      ...input
    }: FinancialEntryInput & { attachments?: PendingAttachments }) => {
      const entry = await createFinancialEntry(input, user!.id)
      if (!attachments) return { total: 0, failed: 0 }
      const failed = await attachFilesToFinancialEntry(entry.id, attachments, user!.id)
      return { total: attachments.files.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      invalidate()
      toast.success('Lançamento registrado!')
      reportAttachments(total, failed)
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
