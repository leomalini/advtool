import { createClient } from '@/lib/supabase/client'
import type { CrmItemWithRelations, CrmItemColumnHistory } from '@/types/crmItem.types'
import type { CrmItemInput } from '@/schemas/crmItem.schema'

const supabase = createClient()

const CRM_ITEM_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name, phone, email, legal_area),
  assigned_profile:profiles!crm_items_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  legal_process:legal_processes(id, cnj_number, court)
`

export async function getCrmItemsByWorkflow(workflowId: string): Promise<CrmItemWithRelations[]> {
  const { data, error } = await supabase
    .from('crm_items')
    .select(CRM_ITEM_SELECT)
    .eq('workflow_id', workflowId)
    .order('position', { ascending: true })

  if (error) throw error
  return data as unknown as CrmItemWithRelations[]
}

/** Retorna o número de itens por workflow_id: { [workflowId]: total }. */
export async function getCrmItemCountsByWorkflow(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('crm_items').select('workflow_id')

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { workflow_id: string }[]) {
    counts[row.workflow_id] = (counts[row.workflow_id] ?? 0) + 1
  }
  return counts
}

export async function getCrmItemById(id: string): Promise<CrmItemWithRelations> {
  const { data, error } = await supabase
    .from('crm_items')
    .select(CRM_ITEM_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as unknown as CrmItemWithRelations
}

export async function createCrmItemRecord(
  input: CrmItemInput,
  userId: string
): Promise<CrmItemWithRelations> {
  const { data, error } = await supabase
    .from('crm_items')
    .insert({ ...input, created_by: userId })
    .select(CRM_ITEM_SELECT)
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
    .from('crm_item_column_history')
    .insert({ crm_item_id: data.id, from_column_id: input.column_id, to_column_id: input.column_id, moved_by: userId })
  if (historyError) {
    console.error('[crm_item_column_history] initial insert failed:', historyError.message)
  }

  return data as unknown as CrmItemWithRelations
}

export async function updateCrmItemRecord(
  id: string,
  input: Partial<CrmItemInput>,
  movedBy?: string | null
): Promise<void> {
  // If the edit moves the item to a different etapa/workflow, record it in the
  // column history so the timeline reflects manual edits (not just kanban drags).
  if (input.column_id) {
    const { data: current } = await supabase
      .from('crm_items')
      .select('column_id')
      .eq('id', id)
      .single()
    if (current && current.column_id !== input.column_id) {
      await insertColumnHistory(id, current.column_id, input.column_id, movedBy ?? null)
    }
  }

  const { error } = await supabase.from('crm_items').update(input).eq('id', id)
  if (error) throw error
}

export async function moveCrmItemColumn(
  id: string,
  columnId: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from('crm_items')
    .update({ column_id: columnId, position })
    .eq('id', id)
  if (error) throw error
}

export async function insertColumnHistory(
  crmItemId: string,
  fromColumnId: string,
  toColumnId: string,
  userId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('crm_item_column_history')
    .insert({ crm_item_id: crmItemId, from_column_id: fromColumnId, to_column_id: toColumnId, moved_by: userId })
  if (error) {
    console.error('[crm_item_column_history] insert failed:', error.message, error.details)
  }
}

export async function deleteCrmItemRecord(id: string): Promise<void> {
  const { error } = await supabase.from('crm_items').delete().eq('id', id)
  if (error) throw error
}

export async function getCrmItemColumnHistory(crmItemId: string): Promise<CrmItemColumnHistory[]> {
  const { data, error } = await supabase
    .from('crm_item_column_history')
    .select('*, moved_by_profile:profiles(full_name, avatar_url)')
    .eq('crm_item_id', crmItemId)
    .order('moved_at', { ascending: true })

  if (error) throw error
  return data as unknown as CrmItemColumnHistory[]
}
