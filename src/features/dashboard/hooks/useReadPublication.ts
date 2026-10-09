'use client'

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  publicationKeys,
  useSetPublicationRead,
} from '@/features/publicacoes/hooks/usePublications'
import type { PublicationPreview } from '../services/dashboard.service'
import { dashboardKeys } from './useDashboardStats'

/**
 * "Marcar como lida" from the dashboard: the row leaves the list and the
 * counts drop at once (optimistic), the server catches up, and the toast's
 * "Desfazer" puts it back in the queue. Whatever happens, the mutation ends by
 * invalidating every publications key, so a failure shows the real state.
 */
export function useReadPublication() {
  const queryClient = useQueryClient()
  const setRead = useSetPublicationRead()

  return (publication: PublicationPreview) => {
    const drop = (rows: PublicationPreview[] | undefined) =>
      rows?.filter((row) => row.id !== publication.id)
    const decrement = (count: number | undefined) =>
      count === undefined ? count : Math.max(count - 1, 0)

    queryClient.setQueryData(dashboardKeys.unreadPublicationsPreview, drop)
    queryClient.setQueryData(dashboardKeys.unreadOrphanPublicationsPreview, drop)
    queryClient.setQueryData(publicationKeys.unreadCount(), decrement)
    if (!publication.legal_process_id) {
      queryClient.setQueryData(dashboardKeys.unreadOrphanPublications, decrement)
    }

    setRead.mutate({ id: publication.id, read: true })
    toast.success('Publicação marcada como lida', {
      description: publication.title ?? undefined,
      action: {
        label: 'Desfazer',
        onClick: () => setRead.mutate({ id: publication.id, read: false }),
      },
    })
  }
}
