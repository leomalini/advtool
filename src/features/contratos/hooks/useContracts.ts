'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getContractById,
  getContracts,
  getContractStatusChanges,
} from '../services/contracts.service'

/** Tudo sob o prefixo ['contracts'] para que uma invalidação alcance a lista,
 * o detalhe e o histórico de uma vez. */
export const contractKeys = {
  all: ['contracts'] as const,
  detail: (id: string) => ['contracts', 'detail', id] as const,
  statusChanges: (id: string) => ['contracts', 'status-changes', id] as const,
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
