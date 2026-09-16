'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getClientPortalLink,
  issueClientPortalLink,
  revokeClientPortalLink,
} from '../services/clientPortalLink.service'

export const clientPortalLinkKeys = {
  byClient: (clientId: string) => ['client_portal_link', clientId] as const,
}

export function useClientPortalLink(clientId: string) {
  return useQuery({
    queryKey: clientPortalLinkKeys.byClient(clientId),
    queryFn: () => getClientPortalLink(clientId),
  })
}

/** Emite (ou reemite). O retorno carrega a URL em claro — quem chama a exibe
 * imediatamente, porque ela não existe em lugar nenhum depois. */
export function useIssueClientPortalLink(clientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => issueClientPortalLink(clientId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalLinkKeys.byClient(clientId) })
    },
  })
}

export function useRevokeClientPortalLink(clientId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => revokeClientPortalLink(clientId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalLinkKeys.byClient(clientId) })
    },
  })
}
