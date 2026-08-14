'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getClients,
  getClientById,
  getClientsPendencies,
  getClientComments,
} from '../services/clientes.service'

export const clientKeys = {
  all: ['clients'] as const,
  detail: (id: string) => ['clients', id] as const,
  comments: (id: string) => ['clients', 'comments', id] as const,
  pendencies: ['client-pendencies'] as const,
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

export function useClientComments(clientId: string) {
  return useQuery({
    queryKey: clientKeys.comments(clientId),
    queryFn: () => getClientComments(clientId),
    enabled: !!clientId,
  })
}

export function useClientesPendencies() {
  return useQuery({
    queryKey: clientKeys.pendencies,
    queryFn: getClientsPendencies,
  })
}
