'use client'

import { useQuery } from '@tanstack/react-query'
import { getClients, getClientById, getClientAttachments } from '../services/clientes.service'

export const clientKeys = {
  all: ['clients'] as const,
  detail: (id: string) => ['clients', id] as const,
  attachments: (id: string) => ['client-attachments', id] as const,
}

export function useClientes() {
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: getClients,
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => getClientById(id),
    enabled: !!id,
  })
}

export function useClienteAttachments(clientId: string) {
  return useQuery({
    queryKey: clientKeys.attachments(clientId),
    queryFn: () => getClientAttachments(clientId),
    enabled: !!clientId,
  })
}
