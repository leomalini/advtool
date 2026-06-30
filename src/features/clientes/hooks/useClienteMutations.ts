'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createClientRecord,
  updateClientRecord,
  deleteClientRecord,
  uploadClientAttachment,
  deleteClientAttachment,
} from '../services/clientes.service'
import { clientKeys } from './useClientes'
import { useAuth } from '@/hooks/useAuth'
import type { CreateClientInput } from '@/schemas/cliente.schema'

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

export function useUploadAttachment(clientId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (file: File) => uploadClientAttachment(clientId, file, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.attachments(clientId) })
      toast.success('Arquivo enviado!')
    },
    onError: () => toast.error('Erro ao enviar arquivo.'),
  })
}

export function useDeleteAttachment(clientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath: string }) =>
      deleteClientAttachment(id, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.attachments(clientId) })
      toast.success('Arquivo removido.')
    },
    onError: () => toast.error('Erro ao remover arquivo.'),
  })
}
