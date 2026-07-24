'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createCaseRecord,
  updateCaseRecord,
  moveCaseColumn,
  deleteCaseRecord,
  addCaseMovement,
} from '../services/cases.service'
import { caseKeys } from './useCases'
import { useAuth } from '@/hooks/useAuth'
import type { CaseInput } from '@/schemas/case.schema'
import type { CaseWithRelations } from '@/types/case.types'

export function useCreateCase(workflowId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CaseInput) => createCaseRecord(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.counts() })
      toast.success('Caso cadastrado!')
    },
    onError: () => toast.error('Erro ao cadastrar caso.'),
  })
}

export function useUpdateCase(id: string, workflowId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Partial<CaseInput>) => updateCaseRecord(id, input, user?.id ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.columnHistory(id) })
      queryClient.invalidateQueries({ queryKey: caseKeys.counts() })
      toast.success('Caso atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar caso.'),
  })
}

export function useMoveCase(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, columnId, position }: { id: string; columnId: string; position: number }) =>
      moveCaseColumn(id, columnId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.counts() })
    },
    onError: () => toast.error('Erro ao mover caso.'),
  })
}

export function useDeleteCase(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteCaseRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      toast.success('Caso removido.')
    },
    onError: () => toast.error('Erro ao remover caso.'),
  })
}

// ── Bulk actions (table view multi-select) ─────────────────────────────────

export function useBulkUpdateCases(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      ids,
      getInput,
    }: {
      ids: string[]
      /** Called per case id — lets bulk edits merge into each case's own current state (e.g. adding a tag). */
      getInput: (id: string) => Partial<CaseInput>
    }) => Promise.all(ids.map((id) => updateCaseRecord(id, getInput(id)))),
    onSuccess: (_data, { ids }) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.counts() })
      toast.success(`${ids.length} caso(s) atualizado(s)!`)
    },
    onError: () => toast.error('Erro ao atualizar casos.'),
  })
}

export function useBulkDeleteCases(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => deleteCaseRecord(id))),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.counts() })
      toast.success(`${ids.length} caso(s) removido(s).`)
    },
    onError: () => toast.error('Erro ao remover casos.'),
  })
}

export function useAddCaseMovement(caseId: string, workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ description, movementDate }: { description: string; movementDate: string }) =>
      addCaseMovement(caseId, description, movementDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.detail(caseId) })
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
      toast.success('Movimentação adicionada!')
    },
    onError: () => toast.error('Erro ao adicionar movimentação.'),
  })
}

// ── Optimistic move (for DnD) ──────────────────────────────────────────────
// Handles the PATCH to cases + optimistic cache update.
// History recording (case_column_history) is the board's responsibility:
// handleDragEnd reads the final column from the cache and calls
// insertColumnHistory directly — avoiding all closure/context race conditions.

export function useOptimisticMoveCase(workflowId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, columnId, position }: {
      id: string
      columnId: string
      position: number
    }) => moveCaseColumn(id, columnId, position),
    onMutate: async ({ id, columnId }) => {
      await queryClient.cancelQueries({ queryKey: caseKeys.workflow(workflowId) })
      const previous = queryClient.getQueryData<CaseWithRelations[]>(
        caseKeys.workflow(workflowId)
      )
      queryClient.setQueryData<CaseWithRelations[]>(
        caseKeys.workflow(workflowId),
        (old) =>
          old?.map((c) => (c.id === id ? { ...c, column_id: columnId } : c)) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(caseKeys.workflow(workflowId), context.previous)
      }
      toast.error('Erro ao mover caso.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: caseKeys.workflow(workflowId) })
    },
  })
}
