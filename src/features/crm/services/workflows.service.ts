import { createClient } from '@/lib/supabase/client'
import type { Workflow } from '@/types/workflow.types'

const supabase = createClient()

export interface WorkflowInput {
  nome: string
  descricao?: string
  cor?: string
}

export interface WorkflowColumnInput {
  nome: string
  cor?: string
  limite?: number | null
}

function genId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${rand}`
}

export async function getWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*, colunas:workflow_columns(*)')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as Workflow[]).map((wf) => ({
    ...wf,
    colunas: wf.colunas.slice().sort((a, b) => a.posicao - b.posicao),
  }))
}

// ── Workflows CRUD ─────────────────────────────────────────────────────────

export async function createWorkflow(input: WorkflowInput): Promise<string> {
  const id = genId('wf')
  const { error } = await supabase.from('workflows').insert({
    id,
    nome: input.nome,
    descricao: input.descricao ?? '',
    cor: input.cor ?? '#6366f1',
  })
  if (error) throw error

  // Seed a first column so the new workflow is immediately usable in the kanban.
  const { error: colError } = await supabase.from('workflow_columns').insert({
    id: genId('col'),
    workflow_id: id,
    nome: 'Nova etapa',
    cor: '#94a3b8',
    posicao: 0,
  })
  if (colError) throw colError

  return id
}

export async function updateWorkflow(id: string, input: WorkflowInput): Promise<void> {
  const { error } = await supabase
    .from('workflows')
    .update({
      nome: input.nome,
      descricao: input.descricao ?? '',
      cor: input.cor,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWorkflow(id: string): Promise<void> {
  const { error } = await supabase.from('workflows').delete().eq('id', id)
  if (error) throw error
}

export async function countCasesInWorkflow(workflowId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId)
  if (error) throw error
  return count ?? 0
}

// ── Columns CRUD ───────────────────────────────────────────────────────────

export async function createColumn(
  workflowId: string,
  input: WorkflowColumnInput,
  posicao: number
): Promise<void> {
  const { error } = await supabase.from('workflow_columns').insert({
    id: genId('col'),
    workflow_id: workflowId,
    nome: input.nome,
    cor: input.cor ?? '#94a3b8',
    posicao,
    limite: input.limite ?? null,
  })
  if (error) throw error
}

export async function updateColumn(
  id: string,
  input: Partial<WorkflowColumnInput & { posicao: number }>
): Promise<void> {
  const { error } = await supabase.from('workflow_columns').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase.from('workflow_columns').delete().eq('id', id)
  if (error) throw error
}

export async function countCasesInColumn(columnId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', columnId)
  if (error) throw error
  return count ?? 0
}

/** Persiste a nova ordem das colunas (posicao) em lote. */
export async function reorderColumns(
  items: { id: string; posicao: number }[]
): Promise<void> {
  const results = await Promise.all(
    items.map((i) =>
      supabase.from('workflow_columns').update({ posicao: i.posicao }).eq('id', i.id)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
