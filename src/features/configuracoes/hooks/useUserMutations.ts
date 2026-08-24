'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { inviteUser, updateUser } from '../services/users.service'
import { userKeys } from './useUsers'
import type { UpdateUserInput } from '@/schemas/user.schema'

export function useInviteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: inviteUser,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      toast.success(`Convite enviado para ${variables.email}.`)
    },
    // A rota já devolve mensagem pronta em português (e-mail duplicado, chave
    // ausente, perfil não aplicado) — repassar é mais útil que genericizar.
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateUserInput & { id: string }) => updateUser(id, patch),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      // A lista de perfis alimenta seletores de responsável em toda a app, e o
      // nome/perfil exibido lá vem dela.
      queryClient.invalidateQueries({ queryKey: ['profiles'] })

      if (variables.is_active === false) toast.success('Acesso desativado.')
      else if (variables.is_active === true) toast.success('Acesso reativado.')
      else toast.success('Perfil atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
