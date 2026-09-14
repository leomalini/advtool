import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import { updateCrmItemRecord } from '@/features/crm/services/crmItems.service'
import type {
  LegalProcessWithRelations,
  LegalProcessMovement,
  LegalProcessMovementWithContext,
  ProcessoPendency,
  ProcessoIssue,
  LegalProcessPartyInput,
} from '@/types/legalProcess.types'
import { STALE_MOVEMENT_DAYS, DEADLINE_WARNING_DAYS } from '@/types/legalProcess.types'
import type { CrmItemWithRelations } from '@/types/crmItem.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'

const supabase = createClient()

const CRM_ITEM_FIELDS = `
  *,
  client:clients(id, type, name, company_name, trade_name, phone, email),
  assigned_profile:profiles!crm_items_assigned_to_fkey(id, full_name, avatar_url, role, created_at)
`

// Note: PostgREST returns embedded rows in heap order, which shifts after
// updates. Nothing here may depend on the order of `crm_items` — that's why
// pickMasterCrmItem sorts before falling back.
const LEGAL_PROCESS_SELECT = `
  *,
  crm_items:crm_items!crm_items_legal_process_id_fkey(${CRM_ITEM_FIELDS}),
  movements:legal_process_movements(*),
  parties:legal_process_parties(*, client:clients(id, type, name, company_name, trade_name)),
  public_documents:legal_process_public_documents(*),
  publications:publications(*)
`

/** A processo can be linked to items in several workflows — the "master" one
 * (used for display in the Processos module) is always the item living in
 * the fixed wf-processos workflow. Returns null when the processo has no
 * linked item at all, so consumers get an explicit absence instead of
 * `undefined` leaking through a non-nullable type.
 *
 * The fallback is sorted rather than positional: the embedded array has no
 * guaranteed order, so `crmItems[0]` could pick a different item on each fetch
 * and silently switch which comment thread / header the modal shows. */
function pickMasterCrmItem(crmItems: CrmItemWithRelations[]): CrmItemWithRelations | null {
  const master = crmItems.find((c) => c.workflow_id === 'wf-processos')
  if (master) return master

  const [oldest] = [...crmItems].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )
  return oldest ?? null
}

function toLegalProcessWithRelations(row: {
  crm_items: CrmItemWithRelations[]
  [key: string]: unknown
}): LegalProcessWithRelations {
  const { crm_items, ...rest } = row
  const items = crm_items ?? []
  // crm_items is kept (not discarded as before): the Agenda/Tarefas tabs need
  // every linked item's id to find records created from a sibling card.
  return {
    ...rest,
    crm_item: pickMasterCrmItem(items),
    crm_items: items,
    // Defensivo como crm_items: consumidores iteram sem checar.
    parties: (rest.parties as LegalProcessWithRelations['parties']) ?? [],
    public_documents:
      (rest.public_documents as LegalProcessWithRelations['public_documents']) ?? [],
    publications: (rest.publications as LegalProcessWithRelations['publications']) ?? [],
  } as LegalProcessWithRelations
}

/** Um formulário só alimenta duas tabelas: os campos jurídicos vão para
 * `legal_processes`, o resto para o `crm_item` que representa o processo. */
function splitInput(input: Partial<LegalProcessInput>) {
  const {
    cnj_number,
    court,
    court_division,
    plaintiff,
    defendant,
    opposing_counsel,
    process_type,
    status,
    procedural_class,
    subject,
    comarca,
    case_value,
    filing_date,
    // Vive em tabela própria — se cair no rest, o insert de crm_items falha
    // com "column parties does not exist".
    parties,
    ...crmItemFields
  } = input

  /** Primeira parte de um polo, na ordem de exibição. */
  const firstOfPolo = (polo: 'ativo' | 'passivo') =>
    [...(parties ?? [])]
      .filter((p) => p.polo === polo && p.name.trim())
      .sort((a, b) => a.position - b.position)[0]?.name ?? null

  // '' vem de input/select intocado e o Postgres recusa em coluna date/numeric.
  const legalProcessFields = {
    cnj_number,
    court,
    court_division,
    // Espelham a primeira parte de cada polo sempre que a lista vier no patch.
    // São campos legados (fallback de exibição e alvo da busca em
    // filterLegalProcesses) — deixá-los intocados enquanto as partes mudam
    // faria a busca por nome apontar para quem já saiu do processo.
    plaintiff: parties === undefined ? plaintiff : firstOfPolo('ativo'),
    defendant: parties === undefined ? defendant : firstOfPolo('passivo'),
    opposing_counsel,
    process_type,
    status,
    procedural_class,
    subject,
    comarca,
    case_value: case_value === undefined || Number.isNaN(case_value) ? undefined : case_value,
    // undefined = campo ausente do patch, não tocar. '' = limpeza explícita.
    // Emitir `null` para ausente apagaria a data em qualquer update parcial —
    // o mesmo bug que o toDbPatch de eventos precisou corrigir.
    filing_date: filing_date === undefined ? undefined : filing_date || null,
  }

  return { crmItemFields, legalProcessFields, parties }
}

/** Substitui as partes do processo pelas informadas.
 *
 * Delete-then-insert em vez de diff: a origem (API ou formulário) sempre manda
 * a lista completa, e casar item a item exigiria uma chave estável que a API
 * não fornece. */
export async function replaceLegalProcessParties(
  legalProcessId: string,
  parties: LegalProcessPartyInput[]
): Promise<void> {
  // Linha adicionada no formulário e deixada em branco não é uma parte.
  const named = parties.filter((p) => p.name.trim())

  const { error: deleteError } = await supabase
    .from('legal_process_parties')
    .delete()
    .eq('legal_process_id', legalProcessId)
  if (deleteError) throw deleteError

  if (named.length === 0) return

  const { error } = await supabase.from('legal_process_parties').insert(
    named.map((p, index) => ({
      legal_process_id: legalProcessId,
      name: p.name,
      document: p.document ?? null,
      polo: p.polo,
      party_type: p.party_type ?? null,
      position: p.position ?? index,
      client_id: p.client_id ?? null,
    }))
  )
  if (error) throw error
}

/** Vincula (ou desvincula, com `null`) uma parte a um cliente cadastrado.
 *
 * Só faz sentido para partes persistidas: as que vêm do fallback
 * `plaintiff`/`defendant` não têm linha própria e por isso não têm id. */
export async function linkPartyToClient(
  partyId: string,
  clientId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('legal_process_parties')
    .update({ client_id: clientId })
    .eq('id', partyId)
  if (error) throw error
}

/** Marca uma publicação como lida e/ou tratada.
 *
 * Ler e providenciar são estados distintos — abrir uma intimação não é o mesmo
 * que ter cumprido o que ela pede —, por isso as duas colunas.
 */
export async function markMovement(
  movementId: string,
  patch: { read?: boolean; handled?: boolean }
): Promise<void> {
  const now = new Date().toISOString()
  const update: Record<string, string | null> = {}

  if (patch.read !== undefined) update.read_at = patch.read ? now : null
  if (patch.handled !== undefined) {
    update.handled_at = patch.handled ? now : null
    // Tratar implica ter lido; o inverso não vale.
    if (patch.handled) update.read_at = now
  }
  if (Object.keys(update).length === 0) return

  const { error } = await supabase
    .from('legal_process_movements')
    .update(update)
    .eq('id', movementId)
  if (error) throw error
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

/** All legal processes whose master crm_item (in wf-processos) belongs to a given client — used by the client detail modal. */
export async function getLegalProcessesByClient(clientId: string): Promise<LegalProcessWithRelations[]> {
  const { data, error } = await supabase
    .from('legal_processes')
    .select(`
      *,
      crm_items:crm_items!crm_items_legal_process_id_fkey!inner(${CRM_ITEM_FIELDS}),
      movements:legal_process_movements(*)
    `)
    .eq('crm_items.client_id', clientId)
    .eq('crm_items.workflow_id', 'wf-processos')
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

/** Prefix search over our own CNJ numbers, fired as the user types (before the
 * number is complete) — lets the UI suggest already-tracked processos early,
 * instead of waiting for all 20 digits before checking anything. */
export async function searchLegalProcessesByCnjPrefix(
  prefix: string,
  limit = 6
): Promise<LegalProcessWithRelations[]> {
  const clean = prefix.trim()
  if (!clean) return []

  const { data, error } = await supabase
    .from('legal_processes')
    .select(`
      *,
      crm_items:crm_items!crm_items_legal_process_id_fkey!inner(${CRM_ITEM_FIELDS}),
      movements:legal_process_movements(*)
    `)
    .ilike('cnj_number', `${clean}%`)
    .limit(limit)

  if (error) throw error
  return (data as unknown[]).map((row) =>
    toLegalProcessWithRelations(row as Parameters<typeof toLegalProcessWithRelations>[0])
  )
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
  const { crmItemFields, legalProcessFields, parties } = splitInput(input)

  const { data: legalProcess, error: processError } = await supabase
    .from('legal_processes')
    .insert(legalProcessFields)
    .select('id')
    .single()
  if (processError) throw processError

  if (parties?.length) {
    await replaceLegalProcessParties(legalProcess.id, parties)
  }

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

  await recordActivity({
    type: 'legal_process_created',
    entity_type: 'legal_process',
    entity_id: legalProcess.id,
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
  // Reaproveita o mesmo split do create — antes esta função duplicava a lista
  // de campos jurídicos, e qualquer coluna nova teria que ser lembrada em dois
  // lugares (foi assim que os campos novos ficariam de fora do update).
  const { crmItemFields, legalProcessFields, parties } = splitInput(input)

  // `undefined` = o patch não fala de partes, então não mexe. Um array vazio é
  // uma ordem legítima de apagar todas.
  if (parties !== undefined) {
    await replaceLegalProcessParties(legalProcessId, parties)
  }

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

/**
 * What a deletion actually costs, split by fate.
 *
 * The two groups behave differently and the confirmation has to say so:
 * comments and movements are cascade-deleted for good, while events and tasks
 * only lose their link (`on delete set null`) and stay alive in the agenda and
 * the task board with no trace of where they came from.
 */
export interface DeletionImpact {
  /** Cascade-deleted with the record. */
  comments: number
  movements: number
  /** Kept, but unlinked. */
  events: number
  tasks: number
}

async function countLinked(
  table: 'events' | 'tasks',
  legalProcessId: string,
  crmItemIds: string[]
): Promise<number> {
  const terms = [`legal_process_id.eq.${legalProcessId}`]
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)

  const query = supabase.from(table).select('id', { count: 'exact', head: true })
  const { count } =
    terms.length === 1
      ? await query.eq('legal_process_id', legalProcessId)
      : await query.or(terms.join(','))

  return count ?? 0
}

export async function getLegalProcessDeletionImpact(
  legalProcessId: string
): Promise<DeletionImpact> {
  const { data: items } = await supabase
    .from('crm_items')
    .select('id')
    .eq('legal_process_id', legalProcessId)
  const crmItemIds = (items ?? []).map((i) => i.id as string)

  const [events, tasks, comments, movements] = await Promise.all([
    countLinked('events', legalProcessId, crmItemIds),
    countLinked('tasks', legalProcessId, crmItemIds),
    crmItemIds.length > 0
      ? supabase
          .from('crm_item_comments')
          .select('id', { count: 'exact', head: true })
          .in('crm_item_id', crmItemIds)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
    supabase
      .from('legal_process_movements')
      .select('id', { count: 'exact', head: true })
      .eq('legal_process_id', legalProcessId)
      .then((r) => r.count ?? 0),
  ])

  return { events, tasks, comments, movements }
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

/**
 * Processos com algo faltando ou parado.
 *
 * A checagem "prazo sem trabalho" é a razão de esta função existir: ela só é
 * possível desde que events/tasks ganharam `legal_process_id` (migration 16).
 * Antes, um prazo próximo sem nenhuma tarefa preparando-o era invisível.
 */
export async function getLegalProcessesPendencies(): Promise<ProcessoPendency[]> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const deadlineLimit = new Date(today)
  deadlineLimit.setDate(deadlineLimit.getDate() + DEADLINE_WARNING_DAYS)
  const deadlineLimitStr = deadlineLimit.toISOString().slice(0, 10)
  const staleBefore = new Date(today)
  staleBefore.setDate(staleBefore.getDate() - STALE_MOVEMENT_DAYS)

  const processos = await getLegalProcesses()

  // Uma consulta para cada tabela em vez de uma por processo: o que interessa
  // é só saber se existe trabalho vinculado, então bastam os ids.
  const [{ data: events }, { data: tasks }] = await Promise.all([
    supabase.from('events').select('legal_process_id, crm_item_id'),
    supabase.from('tasks').select('legal_process_id, crm_item_id, status'),
  ])

  const linkedProcessIds = new Set<string>()
  const linkedCrmItemIds = new Set<string>()
  for (const row of (events ?? []) as { legal_process_id: string | null; crm_item_id: string | null }[]) {
    if (row.legal_process_id) linkedProcessIds.add(row.legal_process_id)
    if (row.crm_item_id) linkedCrmItemIds.add(row.crm_item_id)
  }
  for (const row of (tasks ?? []) as {
    legal_process_id: string | null
    crm_item_id: string | null
    status: string
  }[]) {
    // Tarefa concluída não "cobre" um prazo futuro — o trabalho já passou.
    if (row.status === 'done') continue
    if (row.legal_process_id) linkedProcessIds.add(row.legal_process_id)
    if (row.crm_item_id) linkedCrmItemIds.add(row.crm_item_id)
  }

  const pendencies: ProcessoPendency[] = []

  for (const processo of processos) {
    const item = processo.crm_item
    const issues: ProcessoIssue[] = []

    if (!processo.cnj_number) {
      issues.push({ kind: 'missing_cnj', label: 'Sem número CNJ', severity: 'medium' })
    }

    // Prazo próximo (ou vencido) sem nenhum evento/tarefa preparando-o.
    const deadline = item?.next_deadline
    if (deadline && deadline <= deadlineLimitStr) {
      const hasWork =
        linkedProcessIds.has(processo.id) ||
        processo.crm_items.some((c) => linkedCrmItemIds.has(c.id))
      if (!hasWork) {
        issues.push({
          kind: 'deadline_without_work',
          label: deadline < todayStr ? 'Prazo vencido sem tarefa' : 'Prazo próximo sem tarefa',
          severity: 'high',
        })
      }
    }

    // Só cobra movimentação de quem tem CNJ: sem número não há o que monitorar.
    if (processo.cnj_number) {
      const lastMovement = processo.movements
        .map((m) => m.movement_date)
        .sort()
        .at(-1)
      if (!lastMovement || new Date(lastMovement) < staleBefore) {
        issues.push({
          kind: 'stale_movements',
          label: lastMovement
            ? `Sem movimentação há mais de ${STALE_MOVEMENT_DAYS} dias`
            : 'Nenhuma movimentação registrada',
          severity: 'medium',
        })
      }
    }

    if (item && !item.client_id) {
      issues.push({ kind: 'missing_client', label: 'Sem cliente vinculado', severity: 'medium' })
    }
    if (item && !item.assigned_to) {
      issues.push({ kind: 'missing_assignee', label: 'Sem responsável', severity: 'medium' })
    }

    if (issues.length > 0) {
      pendencies.push({
        legalProcessId: processo.id,
        displayName: getCrmItemClientName(item),
        cnjNumber: processo.cnj_number,
        issues,
      })
    }
  }

  // Os que podem custar um prazo primeiro; depois por quantidade de problemas.
  return pendencies.sort((a, b) => {
    const aHigh = a.issues.some((i) => i.severity === 'high') ? 1 : 0
    const bHigh = b.issues.some((i) => i.severity === 'high') ? 1 : 0
    return bHigh - aHigh || b.issues.length - a.issues.length
  })
}

export async function getRecentMovements(limit = 30): Promise<LegalProcessMovementWithContext[]> {
  const { data, error } = await supabase
    .from('legal_process_movements')
    .select(`
      *,
      legal_process:legal_processes(
        id, cnj_number, court,
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
