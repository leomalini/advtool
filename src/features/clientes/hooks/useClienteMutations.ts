'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
  addClientComment,
} from '../services/clientes.service'
import { clientKeys } from './useClientes'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { useAuth } from '@/hooks/useAuth'
import type { CreateClientInput } from '@/schemas/cliente.schema'

export function useAddClientComment(clientId: string, entityTitle: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (content: string) => addClientComment(clientId, content, user!.id, entityTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.comments(clientId) })
      queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
    },
    onError: () => toast.error('Erro ao publicar nota.'),
  })
}

export function useCreateCliente() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateClientInput) => createClientRecord(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Cliente cadastrado!')
    },
    onError: () => toast.error('Erro ao cadastrar cliente.'),
  })
}

export function useUpdateCliente(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Partial<CreateClientInput>) => updateClientRecord(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Cliente atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar cliente.'),
  })
}

export function useDeleteCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteClientRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Cliente removido.')
    },
    onError: () => toast.error('Erro ao remover cliente.'),
  })
}

