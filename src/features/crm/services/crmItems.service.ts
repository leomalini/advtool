import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type {
  CrmItemWithRelations,
  CrmItemColumnHistory,
  CrmItemComment,
} from '@/types/crmItem.types'
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

/** All CRM items (any workflow) linked to a given client — used by the client detail modal. */
export async function getCrmItemsByClient(clientId: string): Promise<CrmItemWithRelations[]> {
  const { data, error } = await supabase
    .from('crm_items')
    .select(CRM_ITEM_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

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

  await recordActivity({
    type: 'case_created',
    entity_type: 'crm_item',
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

  if (input.legal_process_id) {
    await backfillLegalProcessLink(id, input.legal_process_id)
  }
}

/**
 * Stamps this item's events and tasks with the processo it was just linked to.
 *
 * Without it, records created before the link are only reachable through the
 * crm_item — and that link is `on delete set null`, so deleting the card later
 * would quietly detach them from the processo for good. Best-effort: failing to
 * backfill must not fail the edit that triggered it.
 */
async function backfillLegalProcessLink(crmItemId: string, legalProcessId: string): Promise<void> {
  for (const table of ['events', 'tasks'] as const) {
    const { error } = await supabase
      .from(table)
      .update({ legal_process_id: legalProcessId })
      .eq('crm_item_id', crmItemId)
      .is('legal_process_id', null)
    if (error) {
      console.error(`[backfill] ${table} legal_process_id failed:`, error.message)
    }
  }
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

/** Thrown when deleting a crm_item would leave its legal_process with no
 * linked item at all — the processo would still exist but become unreachable
 * from the CRM side, losing its client/etapa/responsável/prazo. Deleting the
 * whole processo is done from the Processos module (deleteLegalProcess). */
export class LastLinkedCrmItemError extends Error {
  constructor() {
    super('Este caso é o único vínculo de um processo. Exclua o processo pelo módulo Processos.')
    this.name = 'LastLinkedCrmItemError'
  }
}

export async function deleteCrmItemRecord(id: string): Promise<void> {
  // maybeSingle, not single: deleting an already-removed item stays a no-op
  // instead of throwing (the delete below is idempotent on its own).
  const { data: item, error: fetchError } = await supabase
    .from('crm_items')
    .select('legal_process_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw fetchError

  if (item?.legal_process_id) {
    const { count, error: countError } = await supabase
      .from('crm_items')
      .select('id', { count: 'exact', head: true })
      .eq('legal_process_id', item.legal_process_id)
    if (countError) throw countError
    if ((count ?? 0) <= 1) throw new LastLinkedCrmItemError()
  }

  const { error } = await supabase.from('crm_items').delete().eq('id', id)
  if (error) throw error
}

// ── Comments ────────────────────────────────────────────────────────────────

const COMMENT_SELECT = `
  *,
  author:profiles!crm_item_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
`

/** Comments across one or more crm_items.
 *
 * Takes a list rather than a single id because a processo can own several CRM
 * cards: a comment written from a Negociação card would otherwise be invisible
 * from the processo, splitting one conversation into threads nobody can see
 * from the other side. Writes always go to a single (master) item. */
export async function getCrmItemComments(crmItemIds: string[]): Promise<CrmItemComment[]> {
  if (crmItemIds.length === 0) return []

  const { data, error } = await supabase
    .from('crm_item_comments')
    .select(COMMENT_SELECT)
    .in('crm_item_id', crmItemIds)
    .order('created_at')

  if (error) throw error
  return data as unknown as CrmItemComment[]
}

export async function addCrmItemComment(
  crmItemId: string,
  content: string,
  userId: string,
  entityTitle: string
): Promise<CrmItemComment> {
  const { data, error } = await supabase
    .from('crm_item_comments')
    .insert({ crm_item_id: crmItemId, author_id: userId, content })
    .select(COMMENT_SELECT)
    .single()

  if (error) throw error

  await recordActivity({
    type: 'case_comment',
    entity_type: 'crm_item',
    entity_id: crmItemId,
    entity_title: entityTitle,
    actor_id: userId,
  })

  return data as unknown as CrmItemComment
}

/** Same split as the processo version: comments die with the card, events and
 * tasks survive but lose the link. See DeletionImpact in legalProcesses.service. */
export async function getCrmItemDeletionImpact(
  crmItemId: string
): Promise<{ comments: number; events: number; tasks: number }> {
  const countBy = (table: 'events' | 'tasks' | 'crm_item_comments') =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('crm_item_id', crmItemId)
      .then((r) => r.count ?? 0)

  const [comments, events, tasks] = await Promise.all([
    countBy('crm_item_comments'),
    countBy('events'),
    countBy('tasks'),
  ])

  return { comments, events, tasks }
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
