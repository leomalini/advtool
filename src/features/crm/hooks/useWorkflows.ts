'use client'

import { useQuery } from '@tanstack/react-query'
import { getWorkflows } from '../services/workflows.service'
import type { WorkflowColumn, Workflow } from '@/types/workflow.types'

export const workflowKeys = {
  all: ['workflows'] as const,
}

export function useWorkflows() {
  return useQuery({
    queryKey: workflowKeys.all,
    queryFn: getWorkflows,
    staleTime: Infinity, // configuração raramente muda na sessão
  })
}

/** Retorna todas as colunas de todos os workflows em um array flat. */
export function useAllColumns(): WorkflowColumn[] {
  const { data: workflows = [] } = useWorkflows()
  return workflows.flatMap((w) => w.colunas)
}

/** Encontra um workflow pelo ID. */
export function useWorkflow(id: string | null | undefined): Workflow | undefined {
  const { data: workflows = [] } = useWorkflows()
  if (!id) return undefined
  return workflows.find((w) => w.id === id)
}
