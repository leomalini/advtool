import { createClient } from '@/lib/supabase/client'
import { updateCrmItemRecord } from '@/features/crm/services/crmItems.service'
import type {
  LegalProcessWithRelations,
  LegalProcessMovement,
  LegalProcessMovementWithContext,
} from '@/types/legalProcess.types'
import type { CrmItemWithRelations } from '@/types/crmItem.types'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'

const supabase = createClient()

const CRM_ITEM_FIELDS = `
  *,
  client:clients(id, type, name, company_name, trade_name, phone, email, legal_area),
  assigned_profile:profiles!crm_items_assigned_to_fkey(id, full_name, avatar_url, role, created_at)
`

const LEGAL_PROCESS_SELECT = `
  *,
  crm_items:crm_items!crm_items_legal_process_id_fkey(${CRM_ITEM_FIELDS}),
  movements:legal_process_movements(*)
`

/** A processo can be linked to items in several workflows — the "master" one
 * (used for display in the Processos module) is always the item living in
 * the fixed wf-processos workflow. */
function pickMasterCrmItem(crmItems: CrmItemWithRelations[]): CrmItemWithRelations {
  return crmItems.find((c) => c.workflow_id === 'wf-processos') ?? crmItems[0]
}

function toLegalProcessWithRelations(row: {
  crm_items: CrmItemWithRelations[]
  [key: string]: unknown
}): LegalProcessWithRelations {
  const { crm_items, ...rest } = row
  return { ...rest, crm_item: pickMasterCrmItem(crm_items) } as LegalProcessWithRelations
}

function splitInput(input: LegalProcessInput) {
  const { cnj_number, court, court_division, plaintiff, defendant, opposing_counsel, ...crmItemFields } = input
  return {
    crmItemFields,
    legalProcessFields: { cnj_number, court, court_division, plaintiff, defendant, opposing_counsel },
  }
}

export async function getLegalProcesses(): Promise<LegalProcessWithRelations[]> {
  const { data, error } = await supabase
    .from('legal_processes')
    .select(LEGAL_PROCESS_SELECT)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data as unknown[]).map((row) =>
    toLegalProcessWithRelations(row as Parameters<typeof toLegalProcessWithRelations>[0])
  )
}

export async function getLegalProcessById(id: string): Promise<LegalProcessWithRelations> {
  const { data, error } = await supabase
    .from('legal_processes')
    .select(LEGAL_PROCESS_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return toLegalProcessWithRelations(data as Parameters<typeof toLegalProcessWithRelations>[0])
}

/** Busca um processo já cadastrado na nossa base pelo número CNJ — usado para
 * evitar chamadas desnecessárias à API externa (BuscaProcessos) quando o
 * processo já existe localmente. */
export async function findLegalProcessByCnj(cnj: string): Promise<LegalProcessWithRelations | null> {
  const { data, error } = await supabase
    .from('legal_processes')
    .select(LEGAL_PROCESS_SELECT)
    .eq('cnj_number', cnj)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return toLegalProcessWithRelations(data as Parameters<typeof toLegalProcessWithRelations>[0])
}

export async function createLegalProcess(
  input: LegalProcessInput,
  userId: string
): Promise<LegalProcessWithRelations> {
  const { crmItemFields, legalProcessFields } = splitInput(input)

  const { data: legalProcess, error: processError } = await supabase
    .from('legal_processes')
    .insert(legalProcessFields)
    .select('id')
    .single()
  if (processError) throw processError

  // Every processo needs at least one item in the fixed wf-processos workflow
  // — that's its "master" tracking card (judicial progression through etapas).
  const { data: crmItem, error: crmItemError } = await supabase
    .from('crm_items')
    .insert({
      ...crmItemFields,
      workflow_id: 'wf-processos',
      legal_process_id: legalProcess.id,
      created_by: userId,
    })
    .select('id')
    .single()
  if (crmItemError) throw crmItemError

  await supabase.from('activities').insert({
    type: 'case_created',
    entity_type: 'case',
    entity_id: crmItem.id,
    entity_title: crmItemFields.title ?? 'Processo',
    actor_id: userId,
  })

  const { error: historyError } = await supabase
    .from('crm_item_column_history')
    .insert({
      crm_item_id: crmItem.id,
      from_column_id: crmItemFields.column_id,
      to_column_id: crmItemFields.column_id,
      moved_by: userId,
    })
  if (historyError) {
    console.error('[crm_item_column_history] initial insert failed:', historyError.message)
  }

  return getLegalProcessById(legalProcess.id)
}

export async function updateLegalProcess(
  legalProcessId: string,
  crmItemId: string,
  input: Partial<LegalProcessInput>,
  movedBy?: string | null
): Promise<void> {
  const { cnj_number, court, court_division, plaintiff, defendant, opposing_counsel, ...crmItemFields } = input
  const legalProcessFields = { cnj_number, court, court_division, plaintiff, defendant, opposing_counsel }

  if (Object.keys(crmItemFields).length > 0) {
    // title on LegalProcessInput is nullable (falls back to the client's name),
    // but the generic CrmItemInput treats it as a plain optional string.
    await updateCrmItemRecord(crmItemId, { ...crmItemFields, title: crmItemFields.title ?? undefined }, movedBy)
  }

  const hasLegalProcessFields = Object.values(legalProcessFields).some((v) => v !== undefined)
  if (hasLegalProcessFields) {
    const { error } = await supabase.from('legal_processes').update(legalProcessFields).eq('id', legalProcessId)
    if (error) throw error
  }
}

export async function deleteLegalProcess(legalProcessId: string): Promise<void> {
  // Remove the master item(s) this processo owns in wf-processos — those only
  // exist to track this specific processo. Items linked from OTHER workflows
  // (e.g. a Negociação deal that references this lawsuit) are kept and just
  // get unlinked via ON DELETE SET NULL when the legal_processes row goes.
  const { error: masterItemsError } = await supabase
    .from('crm_items')
    .delete()
    .eq('legal_process_id', legalProcessId)
    .eq('workflow_id', 'wf-processos')
  if (masterItemsError) throw masterItemsError

  const { error } = await supabase.from('legal_processes').delete().eq('id', legalProcessId)
  if (error) throw error
}

export async function getRecentMovements(limit = 30): Promise<LegalProcessMovementWithContext[]> {
  const { data, error } = await supabase
    .from('legal_process_movements')
    .select(`
      *,
      legal_process:legal_processes(
        id, cnj_number,
        crm_items:crm_items!crm_items_legal_process_id_fkey(id, workflow_id, title, client:clients(type, name, company_name, trade_name))
      )
    `)
    .order('movement_date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data as unknown as LegalProcessMovementWithContext[]
}

export async function addLegalProcessMovement(
  legalProcessId: string,
  description: string,
  movementDate: string
): Promise<LegalProcessMovement> {
  const { data, error } = await supabase
    .from('legal_process_movements')
    .insert({ legal_process_id: legalProcessId, description, movement_date: movementDate, source: 'manual' })
    .select()
    .single()

  if (error) throw error
  return data as LegalProcessMovement
}
