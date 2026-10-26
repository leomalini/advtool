'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getContractById,
  getContracts,
  getContractsForEntity,
  getContractStatusChanges,
} from '../services/contracts.service'
import { getContractParties } from '../services/contractParties.service'

/** Tudo sob o prefixo ['contracts'] para que uma invalidação alcance a lista,
 * o detalhe, o histórico e as partes de uma vez. */
export const contractKeys = {
  all: ['contracts'] as const,
  detail: (id: string) => ['contracts', 'detail', id] as const,
  statusChanges: (id: string) => ['contracts', 'status-changes', id] as const,
  parties: (id: string) => ['contracts', 'parties', id] as const,
  /** Envios à D4Sign (migration 79). */
  signatures: (id: string) => ['contracts', 'signatures', id] as const,
  forEntity: (clientId: string | null, legalProcessId: string | null) =>
    ['contracts', 'entity', clientId ?? '-', legalProcessId ?? '-'] as const,
}

export function useContracts() {
  return useQuery({
    queryKey: contractKeys.all,
    queryFn: getContracts,
  })
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.detail(id),
    queryFn: () => getContractById(id),
    enabled: !!id,
  })
}

export function useContractStatusChanges(id: string) {
  return useQuery({
    queryKey: contractKeys.statusChanges(id),
    queryFn: () => getContractStatusChanges(id),
    enabled: !!id,
  })
}

/** Contratos de um cliente (inclusive onde ele é parte) ou de um processo. */
export function useContractsForEntity(params: {
  clientId?: string | null
  legalProcessId?: string | null
}) {
  const clientId = params.clientId ?? null
  const legalProcessId = params.legalProcessId ?? null
  return useQuery({
    queryKey: contractKeys.forEntity(clientId, legalProcessId),
    queryFn: () => getContractsForEntity({ clientId, legalProcessId }),
    enabled: !!clientId || !!legalProcessId,
  })
}

export function useContractParties(contractId: string | null | undefined) {
  return useQuery({
    queryKey: contractKeys.parties(contractId ?? '-'),
    queryFn: () => getContractParties(contractId as string),
    enabled: !!contractId,
  })
}
