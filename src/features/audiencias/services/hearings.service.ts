import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/common.types'
import type {
  HearingDetail,
  HearingKind,
  HearingStatus,
  HearingWithContext,
} from '@/types/hearing.types'
import type { HearingDetailsInput } from '@/schemas/hearing.schema'

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
    movement:legal_process_movements!hearings_movement_id_fkey(id, title, description, movement_date)
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
 * de perfis, o formato que `normalizeEventRow` da Agenda também entrega. */
function normalizeHearingRow<T extends HearingWithContext>(row: unknown): T {
  const hearing = row as T
  if (!hearing.event) return hearing
  const rawAssignees = hearing.event.assignees as unknown as { profile: Profile | null }[] | null
  return {
    ...hearing,
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
