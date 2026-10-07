'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  attachFilesToFinancialEntry,
  createFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
} from '../services/financialEntries.service'
import { createPaymentLink } from '../services/paymentCharges.service'
import { financialEntryKeys } from './useFinancialEntries'
import { paymentChargeKeys } from './usePaymentCharges'
import { notifyPaymentLinkError } from './usePaymentChargeMutations'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { useAuth } from '@/hooks/useAuth'
import type {
  FinancialEntryInput,
  UpdateFinancialEntryInput,
} from '@/schemas/financialEntry.schema'
import type { PendingAttachments } from '@/types/document.types'
import { chargeGuardMessage } from '@/types/paymentCharge.types'

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
    // O link pode nascer junto com o lançamento (migration 67).
    queryClient.invalidateQueries({ queryKey: paymentChargeKeys.all })
  }
}

/** O resultado do link gerado junto com o lançamento. */
type CreatedPaymentLink = { ok: true } | { ok: false; error: unknown }

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
    // sobem logo depois de ele ser criado. O link de pagamento, idem.
    mutationFn: async ({
      attachments,
      generatePaymentLink,
      ...input
    }: FinancialEntryInput & {
      attachments?: PendingAttachments
      generatePaymentLink?: boolean
    }) => {
      const entry = await createFinancialEntry(input, user!.id)
      const failed = attachments
        ? await attachFilesToFinancialEntry(entry.id, attachments, user!.id)
        : 0

      // Falhar aqui não desfaz o lançamento: ele fica salvo, e o link pode ser
      // gerado de novo pelo detalhe.
      let paymentLink: CreatedPaymentLink | null = null
      if (generatePaymentLink) {
        try {
          await createPaymentLink(entry.id)
          paymentLink = { ok: true }
        } catch (error) {
          paymentLink = { ok: false, error }
        }
      }

      return { entryId: entry.id, total: attachments?.files.length ?? 0, failed, paymentLink }
    },
    onSuccess: ({ total, failed, paymentLink }) => {
      invalidate()
      toast.success(
        paymentLink?.ok ? 'Lançamento registrado e link gerado!' : 'Lançamento registrado!',
      )
      reportAttachments(total, failed)
      if (paymentLink && !paymentLink.ok) {
        notifyPaymentLinkError(
          paymentLink.error,
          'O lançamento foi salvo, mas o link de pagamento não foi gerado.',
        )
      }
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })
}

export function useUpdateFinancialEntry() {
  const invalidate = useInvalidateFinancialSurfaces()

  return useMutation({
    mutationFn: (input: UpdateFinancialEntryInput) => updateFinancialEntry(input),
    onSuccess: () => invalidate(),
    // A trava de cobrança (migration 67) já explica em português o que fazer.
    onError: (error) =>
      toast.error(chargeGuardMessage(error) ?? 'Erro ao atualizar lançamento.'),
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
    onError: (error) => toast.error(chargeGuardMessage(error) ?? 'Erro ao remover lançamento.'),
  })
}
