'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createCrmItemRecord,
  updateCrmItemRecord,
  moveCrmItemColumn,
  deleteCrmItemRecord,
} from '../services/crmItems.service'
import { crmItemKeys } from './useCrmItems'
import { useAuth } from '@/hooks/useAuth'
import type { CrmItemInput } from '@/schemas/crmItem.schema'
import type { CrmItemWithRelations } from '@/types/crmItem.types'

export function useCreateCrmItem(workflowId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CrmItemInput) => createCrmItemRecord(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
      toast.success('Caso cadastrado!')
    },
    onError: () => toast.error('Erro ao cadastrar caso.'),
  })
}

export function useUpdateCrmItem(id: string, workflowId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Partial<CrmItemInput>) => updateCrmItemRecord(id, input, user?.id ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.columnHistory(id) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
      toast.success('Caso atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar caso.'),
  })
}

export function useMoveCrmItem(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, columnId, position }: { id: string; columnId: string; position: number }) =>
      moveCrmItemColumn(id, columnId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
    },
    onError: () => toast.error('Erro ao mover caso.'),
  })
}

export function useDeleteCrmItem(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteCrmItemRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      toast.success('Caso removido.')
    },
    onError: () => toast.error('Erro ao remover caso.'),
  })
}

// ── Bulk actions (table view multi-select) ─────────────────────────────────

export function useBulkUpdateCrmItems(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ids,
      getInput,
    }: {
      ids: string[]
      /** Called per item id — lets bulk edits merge into each item's own current state (e.g. adding a tag). */
      getInput: (id: string) => Partial<CrmItemInput>
    }) => Promise.all(ids.map((id) => updateCrmItemRecord(id, getInput(id)))),
    onSuccess: (_data, { ids }) => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
      toast.success(`${ids.length} caso(s) atualizado(s)!`)
    },
    onError: () => toast.error('Erro ao atualizar casos.'),
  })
}

export function useBulkDeleteCrmItems(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => deleteCrmItemRecord(id))),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
      toast.success(`${ids.length} caso(s) removido(s).`)
    },
    onError: () => toast.error('Erro ao remover casos.'),
  })
}

// ── Optimistic move (for DnD) ──────────────────────────────────────────────
// Handles the PATCH to crm_items + optimistic cache update.
// History recording (crm_item_column_history) is the board's responsibility:
// handleDragEnd reads the final column from the cache and calls
// insertColumnHistory directly — avoiding all closure/context race conditions.

export function useOptimisticMoveCrmItem(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, columnId, position }: {
      id: string
      columnId: string
      position: number
    }) => moveCrmItemColumn(id, columnId, position),
    onMutate: async ({ id, columnId }) => {
      await queryClient.cancelQueries({ queryKey: crmItemKeys.workflow(workflowId) })
      const previous = queryClient.getQueryData<CrmItemWithRelations[]>(
        crmItemKeys.workflow(workflowId)
      )
      queryClient.setQueryData<CrmItemWithRelations[]>(
        crmItemKeys.workflow(workflowId),
        (old) =>
          old?.map((c) => (c.id === id ? { ...c, column_id: columnId } : c)) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(crmItemKeys.workflow(workflowId), context.previous)
      }
      toast.error('Erro ao mover caso.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(workflowId) })
    },
  })
}
