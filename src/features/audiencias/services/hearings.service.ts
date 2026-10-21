import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/common.types'
import type {
  HearingChecklistState,
  HearingChecklistTemplate,
  HearingDetail,
  HearingKind,
  HearingModality,
  HearingStatus,
  HearingWithContext,
} from '@/types/hearing.types'
import type {
  ChecklistTemplateInput,
  HearingDetailsInput,
  HearingKindInput,
} from '@/schemas/hearing.schema'

const supabase = createClient()

/**
 * Os nomes das FKs vão explícitos (migration 76 os declara): `hearings` aponta
 * para `profiles` por duas colunas e para `legal_process_movements` também a
 * partir de `hearing_date_changes`, e o PostgREST recusa embed ambíguo.
 *
 * `eventJoin`: a Pauta filtra pela data, que mora no evento, então precisa do
 * `!inner`. A lista "Sem data" não tem evento nenhum.
 */
function hearingSelect(eventJoin: 'inner' | 'left'): string {
  const event = eventJoin === 'inner' ? 'events!hearings_event_id_fkey!inner' : 'events!hearings_event_id_fkey'
  return `
    *,
    kind:hearing_kinds!hearings_kind_id_fkey(id, label),
    event:${event}(
      id, title, start_at, end_at, all_day, location, show_in_agenda,
      client:clients(id, type, name, company_name, trade_name),
      assignees:event_assignees(profile:profiles(id, full_name, avatar_url, role, created_at))
    ),
    legal_process:legal_processes!hearings_legal_process_id_fkey(
      id, cnj_number, court, court_division, comarca,
      crm_items:crm_items!crm_items_legal_process_id_fkey(
        id, workflow_id, title, client:clients(id, type, name, company_name, trade_name)
      )
    ),
    movement:legal_process_movements!hearings_movement_id_fkey(id, title, description, movement_date),
    checklist:hearing_checklist_items!hearing_checklist_items_hearing_id_fkey(
      id, template_id, label, offset_days, client_brings, position, task_id, done_at, skipped_at,
      task:tasks!hearing_checklist_items_task_id_fkey(id, status, due_date)
    )
  `
}

const DETAIL_EXTRA = `
  confirmed_by:profiles!hearings_date_confirmed_by_fkey(full_name),
  date_changes:hearing_date_changes!hearing_date_changes_hearing_id_fkey(
    id, from_start_at, to_start_at, movement_id, changed_by, changed_at,
    author:profiles!hearing_date_changes_changed_by_fkey(full_name),
    movement:legal_process_movements!hearing_date_changes_movement_id_fkey(movement_date)
  )
`

/** O PostgREST aninha os responsáveis como `[{ profile }]`; aqui vira a lista
 * de perfis, o formato que `normalizeEventRow` da Agenda também entrega. O
 * checklist sai em `position`: ordenar um embed pelo PostgREST exige o nome
 * da tabela no `referencedTable`, e o alias aqui é outro. */
function normalizeHearingRow<T extends HearingWithContext>(row: unknown): T {
  const hearing = row as T
  const checklist = [...(hearing.checklist ?? [])].sort((a, b) => a.position - b.position)
  if (!hearing.event) return { ...hearing, checklist }
  const rawAssignees = hearing.event.assignees as unknown as { profile: Profile | null }[] | null
  return {
    ...hearing,
    checklist,
    event: {
      ...hearing.event,
      assignees: (rawAssignees ?? [])
        .map((assignee) => assignee.profile)
        .filter((profile): profile is Profile => profile !== null),
    },
  }
}

/** Mais cedo primeiro; a ficha sem evento não entra aqui, mas o comparador
 * não pode quebrar se entrar. */
function byStart(a: HearingWithContext, b: HearingWithContext): number {
  return (a.event?.start_at ?? '').localeCompare(b.event?.start_at ?? '')
}

/**
 * A pauta: audiências cujo horário começa em `[from, to]`.
 *
 * Ordena no cliente, e não no PostgREST: `order` sobre a coluna de um embed
 * ordena o embed, não as linhas de `hearings`. A janela máxima da tela (90
 * dias) cabe folgada.
 */
export async function getHearingAgenda(params: {
  from: string
  to: string
  includeCancelled: boolean
}): Promise<HearingWithContext[]> {
  const statuses: HearingStatus[] = params.includeCancelled ? ['designada', 'cancelada'] : ['designada']

  const { data, error } = await supabase
    .from('hearings')
    .select(hearingSelect('inner'))
    .in('status', statuses)
    .gte('event.start_at', params.from)
    .lte('event.start_at', params.to)
  if (error) throw error

  return (data ?? []).map((row) => normalizeHearingRow<HearingWithContext>(row)).sort(byStart)
}

/** Designadas no andamento sem data no texto — o que a pendência
 * `hearing_without_date` conta. Mais antigas primeiro: são as que estão há
 * mais tempo fora da pauta. */
export async function getHearingsWithoutDate(): Promise<HearingWithContext[]> {
  const { data, error } = await supabase
    .from('hearings')
    .select(hearingSelect('left'))
    .eq('status', 'a_designar')
    .order('created_at')
  if (error) throw error

  return (data ?? []).map((row) => normalizeHearingRow<HearingWithContext>(row))
}

export async function getHearing(id: string): Promise<HearingDetail | null> {
  const { data, error } = await supabase
    .from('hearings')
    .select(`${hearingSelect('left')}, ${DETAIL_EXTRA}`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const detail = normalizeHearingRow<HearingDetail>(data)
  return {
    ...detail,
    date_changes: [...(detail.date_changes ?? [])].sort((a, b) =>
      a.changed_at.localeCompare(b.changed_at),
    ),
  }
}

/**
 * Todas as audiências de um processo, em qualquer status, com o histórico de
 * datas — a aba Audiências do processo. Ordena no cliente pela mesma razão da
 * pauta; um processo tem poucas.
 */
export async function getHearingsForProcess(legalProcessId: string): Promise<HearingDetail[]> {
  const { data, error } = await supabase
    .from('hearings')
    .select(`${hearingSelect('left')}, ${DETAIL_EXTRA}`)
    .eq('legal_process_id', legalProcessId)
  if (error) throw error

  return (data ?? []).map((row) => {
    const detail = normalizeHearingRow<HearingDetail>(row)
    return {
      ...detail,
      date_changes: [...(detail.date_changes ?? [])].sort((a, b) =>
        a.changed_at.localeCompare(b.changed_at),
      ),
    }
  })
}

/** Ficha criada sem data saiu, mas a data não entrou: a tela avisa que a
 * audiência ficou na lista "Sem data" em vez de dizer só "erro". */
export class HearingCreatedWithoutDateError extends Error {
  constructor(cause: unknown) {
    super('A audiência foi criada, mas a data não foi salva.', { cause })
    this.name = 'HearingCreatedWithoutDateError'
  }
}

/**
 * Nova audiência a partir do processo: a ficha nasce sem data e, com data
 * informada, passa pelo mesmo `schedule_hearing` da ficha — que cria o
 * compromisso na Agenda com card, cliente e responsável do processo. Um
 * caminho só para o compromisso, em vez de um segundo jeito de montá-lo.
 *
 * São duas escritas. Se a segunda falha, a audiência existe sem data — um
 * estado legítimo, visível na lista "Sem data" e na pendência —, e o erro
 * próprio deixa a tela dizer isso.
 */
export async function createHearing(params: {
  legalProcessId: string
  kindId: string
  modality: HearingModality | null
  userId: string
  schedule: { startAt: string; endAt: string } | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('hearings')
    .insert({
      legal_process_id: params.legalProcessId,
      kind_id: params.kindId,
      modality: params.modality,
      status: 'a_designar',
      source: 'manual',
      created_by: params.userId,
    })
    .select('id')
    .single()
  if (error) throw error

  const id = data.id as string
  if (params.schedule) {
    try {
      await scheduleHearing({ id, ...params.schedule })
    } catch (scheduleError) {
      throw new HearingCreatedWithoutDateError(scheduleError)
    }
  }
  return id
}

/**
 * O que pede atenção agora — o badge do menu: audiência sem data e audiência
 * futura com a data ainda não conferida. Duas contagens `head` em vez de
 * trazer linhas: o menu está em toda tela.
 */
export async function countHearingsNeedingAttention(): Promise<number> {
  const [withoutDate, unconfirmed] = await Promise.all([
    supabase
      .from('hearings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'a_designar'),
    supabase
      .from('hearings')
      .select('id, event:events!hearings_event_id_fkey!inner(start_at)', { count: 'exact', head: true })
      .eq('status', 'designada')
      .is('date_confirmed_at', null)
      .gte('event.start_at', new Date().toISOString()),
  ])
  if (withoutDate.error) throw withoutDate.error
  if (unconfirmed.error) throw unconfirmed.error

  return (withoutDate.count ?? 0) + (unconfirmed.count ?? 0)
}

export async function getHearingKinds(): Promise<HearingKind[]> {
  const { data, error } = await supabase
    .from('hearing_kinds')
    .select('*')
    .order('position')
    .order('label')
  if (error) throw error
  return (data ?? []) as HearingKind[]
}

/**
 * `.select().single()` em toda escrita direta: a RLS nega com zero linhas, não
 * com erro, e sem isso uma tentativa sem permissão voltaria como sucesso.
 */
export async function confirmHearingDate(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('hearings')
    .update({ date_confirmed_at: new Date().toISOString(), date_confirmed_by: userId })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

export async function updateHearingDetails(id: string, input: HearingDetailsInput): Promise<void> {
  const { error } = await supabase
    .from('hearings')
    .update({
      kind_id: input.kind_id,
      modality: input.modality,
      meeting_url: input.meeting_url.trim() || null,
    })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

/** Informa ou altera a data. Sem evento, o banco cria o compromisso na Agenda
 * (com card, cliente e responsável do processo); com evento, move. */
export async function scheduleHearing(params: {
  id: string
  startAt: string
  endAt: string
}): Promise<void> {
  const { error } = await supabase.rpc('schedule_hearing', {
    p_hearing_id: params.id,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
  })
  if (error) throw error
}

/** Cancelar esconde o evento da Agenda sem apagá-lo; para a ficha sem data,
 * é descartá-la. */
export async function setHearingCancelled(id: string, cancelled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_hearing_cancelled', {
    p_hearing_id: id,
    p_cancelled: cancelled,
  })
  if (error) throw error
}

// ── Quadro de preparação ────────────────────────────────────────────────────

/**
 * Tudo que ainda vai acontecer ou espera resultado: as sem data e as
 * designadas, de qualquer data. O Quadro distribui nas colunas
 * (`boardColumn`); a passada sem resultado é "Aguardando resultado".
 */
export async function getOpenHearings(): Promise<HearingWithContext[]> {
  const { data, error } = await supabase
    .from('hearings')
    .select(hearingSelect('left'))
    .in('status', ['a_designar', 'designada'])
  if (error) throw error

  return (data ?? []).map((row) => normalizeHearingRow<HearingWithContext>(row))
}

// ── Checklist ───────────────────────────────────────────────────────────────
//
// Pelas RPCs da migration 77, e não por escrita direta: marcar o item mexe na
// tarefa que ele criou, e a função confere `agenda:update` antes.

export async function setChecklistItemState(itemId: string, state: HearingChecklistState): Promise<void> {
  const { error } = await supabase.rpc('set_hearing_checklist_item', {
    p_item_id: itemId,
    p_state: state,
  })
  if (error) throw error
}

export async function addChecklistItem(params: {
  hearingId: string
  label: string
  offsetDays: number | null
}): Promise<void> {
  const { error } = await supabase.rpc('add_hearing_checklist_item', {
    p_hearing_id: params.hearingId,
    p_label: params.label,
    p_offset_days: params.offsetDays,
  })
  if (error) throw error
}

export async function removeChecklistItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_hearing_checklist_item', { p_item_id: itemId })
  if (error) throw error
}

/** "Marcar como pronta" com itens pendentes — e o desfazer. */
export async function setReadyOverride(id: string, ready: boolean, userId: string): Promise<void> {
  const { error } = await supabase
    .from('hearings')
    .update({
      ready_override_at: ready ? new Date().toISOString() : null,
      ready_override_by: ready ? userId : null,
    })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

// ── Configurações: tipos e modelos ──────────────────────────────────────────

/** Mesmo slug de `eventTypes.service.ts`: o id do tipo é texto legível. */
function slugify(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'audiencia'
  )
}

export async function createHearingKind(input: HearingKindInput): Promise<void> {
  const existing = await getHearingKinds()
  const taken = new Set(existing.map((kind) => kind.id))
  const base = slugify(input.label)
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`

  const { error } = await supabase.from('hearing_kinds').insert({
    id,
    label: input.label.trim(),
    event_title: input.event_title.trim() || null,
    default_duration_minutes: input.default_duration_minutes,
    position: existing.length,
    is_system: false,
  })
  if (error) throw error
}

export async function updateHearingKind(id: string, input: HearingKindInput): Promise<void> {
  const { error } = await supabase
    .from('hearing_kinds')
    .update({
      label: input.label.trim(),
      event_title: input.event_title.trim() || null,
      default_duration_minutes: input.default_duration_minutes,
    })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

/** Quantas audiências usam o tipo: a FK é RESTRICT, e a tela diz antes de
 * tentar, como em Tipos de Evento. */
export async function countHearingsOfKind(kindId: string): Promise<number> {
  const { count, error } = await supabase
    .from('hearings')
    .select('id', { count: 'exact', head: true })
    .eq('kind_id', kindId)
  if (error) throw error
  return count ?? 0
}

export async function deleteHearingKind(id: string): Promise<void> {
  const { error } = await supabase.from('hearing_kinds').delete().eq('id', id)
  if (error) throw error
}

export async function getChecklistTemplates(): Promise<HearingChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('hearing_checklist_templates')
    .select('*')
    .order('position')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as HearingChecklistTemplate[]
}

function templateRow(input: ChecklistTemplateInput) {
  return {
    kind_id: input.kind_id,
    legal_area: input.legal_area,
    label: input.label.trim(),
    // Sem prazo não há tarefa: o CHECK da migration 77 recusaria.
    offset_days: input.offset_days,
    creates_task: input.offset_days !== null && input.creates_task,
    client_brings: input.client_brings,
  }
}

export async function createChecklistTemplate(input: ChecklistTemplateInput): Promise<void> {
  const existing = await getChecklistTemplates()
  const position = existing.filter((template) => template.kind_id === input.kind_id).length
  const { error } = await supabase
    .from('hearing_checklist_templates')
    .insert({ ...templateRow(input), position, is_system: false })
  if (error) throw error
}

export async function updateChecklistTemplate(id: string, input: ChecklistTemplateInput): Promise<void> {
  const { error } = await supabase
    .from('hearing_checklist_templates')
    .update(templateRow(input))
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
}

/** Sai só o modelo: os checklists que já nasceram dele ficam como estão
 * (`template_id` vira nulo). */
export async function deleteChecklistTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('hearing_checklist_templates').delete().eq('id', id)
  if (error) throw error
}
