'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { inviteUser, resendInvite, updateUser } from '../services/users.service'
import { userKeys } from './useUsers'
import type { UpdateUserInput } from '@/schemas/user.schema'
import type { ResendChannel } from '@/types/user.types'

export function useInviteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: inviteUser,
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      // Sem `action_link`, o e-mail saiu. Com ele, a conta existe mas o convite
      // ainda precisa chegar à pessoa — quem avisa é o diálogo do link, então um
      // "convite enviado" aqui seria mentira.
      if (!result.action_link) toast.success(`Convite enviado para ${variables.email}.`)
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

/**
 * Reemissão de convite, por e-mail ou como link para entrega manual.
 *
 * Não emite toast de sucesso no caminho do link: aí a tela abre um diálogo com
 * o link para copiar, e um toast por cima seria ruído — ou, pior, contradiria o
 * aviso de que o e-mail não saiu.
 */
export function useResendInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, canal }: { id: string; canal?: ResendChannel }) =>
      resendInvite(id, canal),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      if (result.sent) toast.success(`Convite reenviado para ${result.email}.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
