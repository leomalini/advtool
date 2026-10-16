'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getClientById } from '@/features/clientes/services/clientes.service'
import type { ContractParty, ContractTemplateValues, PartyPersonData } from '@/types/contract.types'
import {
  createContractParties,
  deleteContractParty,
  saveContractTemplateValues,
  updateContractParty,
  type NewContractParty,
} from '../services/contractParties.service'
import { personFromClient } from '../utils/partyData'
import { contractKeys } from './useContracts'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useAddContractParties(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (parties: NewContractParty[]) => createContractParties(contractId, parties),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.parties(contractId) })
      toast.success(created.length === 1 ? 'Parte adicionada!' : `${created.length} partes adicionadas!`)
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao adicionar a parte.')),
  })
}

export function useUpdateContractParty(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Parameters<typeof updateContractParty>[1]
    }) => updateContractParty(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.parties(contractId) })
      toast.success('Parte atualizada!')
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao atualizar a parte.')),
  })
}

export function useDeleteContractParty(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteContractParty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.parties(contractId) })
      toast.success('Parte removida.')
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao tirar a parte.')),
  })
}

/**
 * Copia de novo os dados do cadastro para uma parte que veio dele. A parte é
 * uma cópia de propósito (migration 70); isto é o "quero os dados novos".
 */
export function useRefreshPartyFromClient(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (party: Pick<ContractParty, 'id' | 'client_id'>) => {
      if (!party.client_id) throw new Error('Esta parte não está ligada a um cliente.')
      const client = await getClientById(party.client_id)
      const person: PartyPersonData = personFromClient(client)
      // Os dados agora são todos do cadastro: as origens antigas não valem mais.
      await updateContractParty(party.id, { ...person, field_sources: {} })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.parties(contractId) })
      toast.success('Dados atualizados do cadastro.')
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao ler o cadastro do cliente.')),
  })
}

export function useSaveContractTemplateValues(contractId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: ContractTemplateValues) => saveContractTemplateValues(contractId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contractKeys.detail(contractId) }),
    onError: (error) => toast.error(errorMessage(error, 'Erro ao guardar os valores da minuta.')),
  })
}
