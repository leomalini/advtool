'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  type WorkflowInput,
  type WorkflowColumnInput,
} from '../services/workflows.service'
import { workflowKeys } from './useWorkflows'
import { crmItemKeys } from './useCrmItems'

function useInvalidateWorkflows() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: workflowKeys.all })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
  }
}

// ── Workflows ──────────────────────────────────────────────────────────────

export function useCreateWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (input: WorkflowInput) => createWorkflow(input),
    onSuccess: () => {
      invalidate()
      toast.success('Workflow criado!')
    },
    onError: () => toast.error('Erro ao criar workflow.'),
  })
}

export function useUpdateWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WorkflowInput }) =>
      updateWorkflow(id, input),
    onSuccess: () => {
      invalidate()
      toast.success('Workflow atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar workflow.'),
  })
}

export function useDeleteWorkflow() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      invalidate()
      toast.success('Workflow removido.')
    },
    onError: () => toast.error('Erro ao remover workflow.'),
  })
}

// ── Columns ────────────────────────────────────────────────────────────────

export function useCreateColumn() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
      posicao,
    }: {
      workflowId: string
      input: WorkflowColumnInput
      posicao: number
    }) => createColumn(workflowId, input, posicao),
    onSuccess: () => {
      invalidate()
      toast.success('Etapa adicionada!')
    },
    onError: () => toast.error('Erro ao adicionar etapa.'),
  })
}

export function useUpdateColumn() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: Partial<WorkflowColumnInput & { posicao: number }>
    }) => updateColumn(id, input),
    onSuccess: () => {
      invalidate()
    },
    onError: () => toast.error('Erro ao atualizar etapa.'),
  })
}

export function useDeleteColumn() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (id: string) => deleteColumn(id),
    onSuccess: () => {
      invalidate()
      toast.success('Etapa removida.')
    },
    onError: () => toast.error('Erro ao remover etapa.'),
  })
}

export function useReorderColumns() {
  const invalidate = useInvalidateWorkflows()
  return useMutation({
    mutationFn: (items: { id: string; posicao: number }[]) => reorderColumns(items),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao reordenar etapas.'),
  })
}
