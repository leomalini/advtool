'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  sendChargeLinkEmail,
  sendPortalLinkEmail,
  sendTestEmail,
} from '../services/emailMessages.service'
import { emailMessageKeys } from './useEmailMessages'

/** Invalida em `onSettled`, não só no sucesso: envio recusado também deixa
 * linha (bloqueio, falha do Resend), e o histórico tem de mostrá-la. */
export function useSendPortalLinkEmail(clientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => sendPortalLinkEmail(clientId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailMessageKeys.all })
    },
  })
}

export function useSendChargeLinkEmail(chargeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => sendChargeLinkEmail(chargeId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailMessageKeys.all })
    },
  })
}

export function useSendTestEmail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendTestEmail,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailMessageKeys.all })
    },
  })
}
