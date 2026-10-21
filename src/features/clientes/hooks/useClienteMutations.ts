'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createClientRecord,
  createPersonRecord,
  updateClientRecord,
  deleteClientRecord,
  addClientComment,
  convertToClient,
  convertToPerson,
} from '../services/clientes.service'
import { clientKeys } from './useClientes'
import { useAuth } from '@/hooks/useAuth'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import type { RecordKind } from '@/types/cliente.types'

interface KindMessages {
  created: string
  createError: string
  updated: string
  updateError: string
  deleted: string
  deleteError: string
}

/** Mesmo cadastro, dois nomes: o toast fala do que a pessoa vê na tela. */
const MESSAGES: Record<RecordKind, KindMessages> = {
  client: {
    created: 'Cliente cadastrado!',
    createError: 'Erro ao cadastrar cliente.',
    updated: 'Cliente atualizado!',
    updateError: 'Erro ao atualizar cliente.',
    deleted: 'Cliente removido.',
    deleteError: 'Erro ao remover cliente.',
  },
  person: {
    created: 'Pessoa cadastrada!',
    createError: 'Erro ao cadastrar pessoa.',
    updated: 'Pessoa atualizada!',
    updateError: 'Erro ao atualizar pessoa.',
    deleted: 'Pessoa removida.',
    deleteError: 'Erro ao remover pessoa.',
  },
}

export function useAddClientComment(clientId: string, entityTitle: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (content: string) => addClientComment(clientId, content, user!.id, entityTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.comments(clientId) })
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
      toast.success(MESSAGES.client.created)
    },
    onError: () => toast.error(MESSAGES.client.createError),
  })
}

/** Pessoa que não é cliente (migration 78). Não mexe nas pendências: pessoa
 * não tem. */
export function useCreatePessoa() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateClientInput) => createPersonRecord(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success(MESSAGES.person.created)
    },
    onError: () => toast.error(MESSAGES.person.createError),
  })
}

export function useUpdateCliente(id: string, kind: RecordKind = 'client') {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Partial<CreateClientInput>) => updateClientRecord(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success(MESSAGES[kind].updated)
    },
    onError: () => toast.error(MESSAGES[kind].updateError),
  })
}

export function useDeleteCliente(kind: RecordKind = 'client') {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteClientRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success(MESSAGES[kind].deleted)
    },
    onError: () => toast.error(MESSAGES[kind].deleteError),
  })
}

/** Os dois sentidos da conversão mudam as mesmas três coisas: as listas e a
 * ficha (raiz `clients`) e as pendências, que só contam clientes. */
function invalidateConversion(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: clientKeys.all })
  queryClient.invalidateQueries({ queryKey: clientKeys.pendencies })
}

/** Pessoa → cliente. O erro do banco (sem `clientes:create`) já vem escrito
 * para a tela. */
export function useConvertToClient() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (id: string) => convertToClient(id, user!.id),
    onSuccess: () => {
      invalidateConversion(queryClient)
      toast.success('Agora é cliente.')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

/** Cliente → pessoa. Sem toast de erro: a recusa do banco lista o que impede,
 * e o diálogo mostra essa lista no lugar, onde dá para ler. */
export function useConvertToPerson() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (id: string) => convertToPerson(id, user!.id),
    onSuccess: () => {
      invalidateConversion(queryClient)
      toast.success('Movido para Pessoas.')
    },
  })
}
