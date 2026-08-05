'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCrmItemComments, addCrmItemComment } from '../services/crmItems.service'
import { crmItemKeys } from './useCrmItems'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { useAuth } from '@/hooks/useAuth'

/** Comments across every crm_item passed in — the ProcessoModal reads the union
 * of its linked cards so one conversation isn't split per card. */
export function useCrmItemComments(crmItemIds: string[]) {
  // Sorted for a stable query key (see useEventsForEntity).
  const ids = [...crmItemIds].sort()

  return useQuery({
    queryKey: crmItemKeys.comments(ids),
    queryFn: () => getCrmItemComments(ids),
    enabled: ids.length > 0,
  })
}

export function useAddCrmItemComment(crmItemId: string, entityTitle: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (content: string) =>
      addCrmItemComment(crmItemId, content, user!.id, entityTitle),
    onSuccess: () => {
      // Prefix invalidation: the reader's key carries the whole id list, which
      // this writer doesn't know — ['crm_items','comments'] covers every combo.
      queryClient.invalidateQueries({ queryKey: ['crm_items', 'comments'] })
      queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
    },
    onError: () => toast.error('Erro ao publicar comentário.'),
  })
}
