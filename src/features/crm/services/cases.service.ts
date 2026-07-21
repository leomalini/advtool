import { createClient } from '@/lib/supabase/client'
import type { CaseWithRelations, CaseMovement } from '@/types/case.types'
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

  return data as CaseWithRelations
}

export async function updateCaseRecord(
  id: string,
  input: Partial<CaseInput>
): Promise<void> {
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

export async function deleteCaseRecord(id: string): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id)
  if (error) throw error
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
