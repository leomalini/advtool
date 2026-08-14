'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createLegalProcess,
  updateLegalProcess,
  deleteLegalProcess,
  addLegalProcessMovement,
  markMovement,
  replaceLegalProcessParties,
  linkPartyToClient,
} from '../services/legalProcesses.service'
import { legalProcessKeys } from './useLegalProcesses'
import { crmItemKeys } from '@/features/crm/hooks/useCrmItems'
import { useAuth } from '@/hooks/useAuth'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import type { LegalProcessPartyInput } from '@/types/legalProcess.types'

export function useInvalidateLegalProcesses() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.all })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow('wf-processos') })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
  }
}

/** Marca uma publicação como lida/tratada. Invalida a lista inteira porque a
 * contagem de não lidas aparece no cabeçalho e nas abas. */
export function useMarkMovement() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({
      movementId,
      ...patch
    }: {
      movementId: string
      read?: boolean
      handled?: boolean
    }) => markMovement(movementId, patch),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Não foi possível atualizar a publicação.'),
  })
}

/** Vincula uma parte a um cliente cadastrado — ou desfaz o vínculo com `null`. */
export function useLinkPartyToClient() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({ partyId, clientId }: { partyId: string; clientId: string | null }) =>
      linkPartyToClient(partyId, clientId),
    onSuccess: (_data, { clientId }) => {
      invalidate()
      toast.success(clientId ? 'Parte vinculada ao cliente.' : 'Vínculo removido.')
    },
    onError: () => toast.error('Não foi possível vincular a parte.'),
  })
}

export function useReplaceLegalProcessParties() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({
      legalProcessId,
      parties,
    }: {
      legalProcessId: string
      parties: LegalProcessPartyInput[]
    }) => replaceLegalProcessParties(legalProcessId, parties),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao salvar as partes.'),
  })
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
