import { createClient } from '@/lib/supabase/client'
import type { CaseWithRelations, CaseMovement, CaseColumnHistory } from '@/types/case.types'
import type { CaseInput } from '@/schemas/case.schema'

const supabase = createClient()

const CASE_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name, phone, email, legal_area),
  assigned_profile:profiles!cases_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  movements:case_movements(*)
`

export async function getCasesByWorkflow(workflowId: string): Promise<CaseWithRelations[]> {
  const { data, error } = await supabase
    .from('cases')
    .select(CASE_SELECT)
    .eq('workflow_id', workflowId)
    .order('position', { ascending: true })

  if (error) throw error
  return data as CaseWithRelations[]
}

/** Retorna o número de casos por workflow_id: { [workflowId]: total }. */
export async function getCaseCountsByWorkflow(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('cases').select('workflow_id')

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { workflow_id: string }[]) {
    counts[row.workflow_id] = (counts[row.workflow_id] ?? 0) + 1
  }
  return counts
}

export async function getCaseById(id: string): Promise<CaseWithRelations> {
  const { data, error } = await supabase
    .from('cases')
    .select(CASE_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as CaseWithRelations
}

export async function createCaseRecord(
  input: CaseInput,
  userId: string
): Promise<CaseWithRelations> {
  const { data, error } = await supabase
    .from('cases')
    .insert({ ...input, created_by: userId })
    .select(CASE_SELECT)
    .single()

  if (error) throw error

  await supabase.from('activities').insert({
    type: 'case_created',
    entity_type: 'case',
    entity_id: data.id,
    entity_title: data.title ?? 'Caso',
    actor_id: userId,
  })

  // Record initial column placement in history.
  // from_column_id === to_column_id signals "created here" (no prior column).
  const { error: historyError } = await supabase
    .from('case_column_history')
    .insert({ case_id: data.id, from_column_id: input.column_id, to_column_id: input.column_id, moved_by: userId })
  if (historyError) {
    console.error('[case_column_history] initial insert failed:', historyError.message)
  }

  return data as CaseWithRelations
}

export async function updateCaseRecord(
  id: string,
  input: Partial<CaseInput>,
  movedBy?: string | null
): Promise<void> {
  // If the edit moves the case to a different etapa/workflow, record it in the
  // column history so the timeline reflects manual edits (not just kanban drags).
  if (input.column_id) {
    const { data: current } = await supabase
      .from('cases')
      .select('column_id')
      .eq('id', id)
      .single()
    if (current && current.column_id !== input.column_id) {
      await insertColumnHistory(id, current.column_id, input.column_id, movedBy ?? null)
    }
  }

  const { error } = await supabase.from('cases').update(input).eq('id', id)
  if (error) throw error
}

export async function moveCaseColumn(
  id: string,
  columnId: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ column_id: columnId, position })
    .eq('id', id)
  if (error) throw error
}

export async function insertColumnHistory(
  caseId: string,
  fromColumnId: string,
  toColumnId: string,
  userId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('case_column_history')
    .insert({ case_id: caseId, from_column_id: fromColumnId, to_column_id: toColumnId, moved_by: userId })
  if (error) {
    console.error('[case_column_history] insert failed:', error.message, error.details)
  }
}

export async function deleteCaseRecord(id: string): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id)
  if (error) throw error
}

export async function getCaseColumnHistory(caseId: string): Promise<CaseColumnHistory[]> {
  const { data, error } = await supabase
    .from('case_column_history')
    .select('*, moved_by_profile:profiles(full_name, avatar_url)')
    .eq('case_id', caseId)
    .order('moved_at', { ascending: true })

  if (error) throw error
  return data as CaseColumnHistory[]
}

export async function getCaseMovements(caseId: string): Promise<CaseMovement[]> {
  const { data, error } = await supabase
    .from('case_movements')
    .select('*')
    .eq('case_id', caseId)
    .order('movement_date', { ascending: false })

  if (error) throw error
  return data as CaseMovement[]
}

export async function addCaseMovement(
  caseId: string,
  description: string,
  movementDate: string
): Promise<CaseMovement> {
  const { data, error } = await supabase
    .from('case_movements')
    .insert({ case_id: caseId, description, movement_date: movementDate, source: 'manual' })
    .select()
    .single()

  if (error) throw error
  return data as CaseMovement
}
