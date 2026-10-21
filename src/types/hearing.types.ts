import type { EventClient } from './event.types'
import type { Profile } from './common.types'

/**
 * Ficha da audiência (migration 76). A DATA não está aqui: ela mora no evento
 * da Agenda (`events.start_at`), e a ficha sem evento é a audiência sem data.
 * Ver docs/audiencias.md.
 */

/** Remarcação não é status — é uma linha em `hearing_date_changes`.
 * `realizada` e `nao_realizada` entram na fase 4. */
export type HearingStatus = 'a_designar' | 'designada' | 'realizada' | 'nao_realizada' | 'cancelada'

export type HearingModality = 'presencial' | 'virtual' | 'hibrida'

export type HearingSource = 'movimentacao' | 'manual'

/** As que ainda vão acontecer — as únicas que o andamento move e a tela
 * reagenda ou cancela. */
export const OPEN_HEARING_STATUSES = ['a_designar', 'designada'] as const satisfies readonly HearingStatus[]

export const HEARING_STATUS_LABELS: Record<HearingStatus, string> = {
  a_designar: 'Sem data',
  designada: 'Designada',
  realizada: 'Realizada',
  nao_realizada: 'Não realizada',
  cancelada: 'Cancelada',
}

export const HEARING_MODALITY_LABELS: Record<HearingModality, string> = {
  presencial: 'Presencial',
  virtual: 'Virtual',
  hibrida: 'Híbrida',
}

export const HEARING_MODALITIES = ['presencial', 'virtual', 'hibrida'] as const satisfies readonly HearingModality[]

export function isOpenHearing(status: HearingStatus): boolean {
  return (OPEN_HEARING_STATUSES as readonly HearingStatus[]).includes(status)
}

/** Cancelada ou não realizada sai da Agenda e fica no módulo (decisão da
 * fase 1). A Agenda filtra por `show_in_agenda`; as listas que não filtram —
 * a aba Agenda do processo — usam isto. */
export function hearingLeavesAgenda(status: HearingStatus): boolean {
  return status === 'cancelada' || status === 'nao_realizada'
}

export interface HearingKind {
  id: string
  /** Curto, o dos chips e filtros: "Conciliação". */
  label: string
  /** Título do compromisso na Agenda: "Audiência de Conciliação". */
  event_title: string | null
  default_duration_minutes: number
  position: number
  is_system: boolean
  created_at: string
}

export interface Hearing {
  id: string
  event_id: string | null
  legal_process_id: string | null
  kind_id: string
  status: HearingStatus
  modality: HearingModality | null
  meeting_url: string | null
  source: HearingSource
  /** O ato mais recente que a ficha segue. */
  movement_id: string | null
  /** Nulo = data lida do texto do andamento, ainda não conferida nos autos. */
  date_confirmed_at: string | null
  date_confirmed_by: string | null
  closed_at: string | null
  /** Quando o checklist foi copiado dos modelos (migration 77). Nulo = ainda
   * não nasceu: falta a data, ou a conferência dela. */
  checklist_generated_at: string | null
  /** A exceção do Quadro: pronta mesmo com itens pendentes. */
  ready_override_at: string | null
  ready_override_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Áreas do caso, o vocabulário de `crm_items.legal_area` (migration 53). */
export const LEGAL_AREAS = [
  'trabalhista',
  'civel',
  'familia',
  'tributario',
  'criminal',
  'previdenciario',
  'consumidor',
] as const

export type LegalArea = (typeof LEGAL_AREAS)[number]

export interface HearingChecklistTemplate {
  id: string
  /** Nulo = todos os tipos. */
  kind_id: string | null
  /** Nulo = todas as áreas. */
  legal_area: LegalArea | null
  label: string
  /** Dias antes da audiência; nulo = sem prazo. */
  offset_days: number | null
  creates_task: boolean
  client_brings: boolean
  position: number
  is_system: boolean
  created_at: string
}

export interface HearingChecklistItem {
  id: string
  template_id: string | null
  label: string
  offset_days: number | null
  client_brings: boolean
  position: number
  task_id: string | null
  done_at: string | null
  skipped_at: string | null
  task: { id: string; status: string; due_date: string | null } | null
}

export type HearingChecklistState = 'done' | 'pending' | 'skipped'

/** O que o evento da Agenda carrega da ficha (embed em `EVENT_SELECT`): o
 * selo "a confirmar", o link para a ficha e o "Entrar na sala" do dashboard. */
export type EventHearingSummary = Pick<
  Hearing,
  'id' | 'status' | 'date_confirmed_at' | 'kind_id' | 'modality' | 'meeting_url'
>

/** O link da sala, quando há sala para entrar: presencial não tem, mesmo com
 * um link antigo salvo (a troca de modalidade não o apaga). */
export function hearingJoinUrl(
  hearing: Pick<Hearing, 'status' | 'modality' | 'meeting_url'> | null | undefined,
): string | null {
  if (!hearing?.meeting_url || hearing.modality === 'presencial') return null
  return isOpenHearing(hearing.status) ? hearing.meeting_url : null
}

/** A ficha está esperando alguém conferir a data nos autos. */
export function isHearingDateUnconfirmed(
  hearing: Pick<Hearing, 'status' | 'date_confirmed_at'> | null | undefined,
): boolean {
  return !!hearing && hearing.status === 'designada' && !hearing.date_confirmed_at
}

/** O evento como a ficha precisa dele. */
export interface HearingEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: boolean
  location: string | null
  show_in_agenda: boolean
  client: EventClient | null
  assignees: Profile[]
}

export interface HearingProcessCrmItem {
  id: string
  workflow_id: string
  title: string | null
  client: EventClient | null
}

export interface HearingProcess {
  id: string
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  crm_items: HearingProcessCrmItem[]
}

export interface HearingMovement {
  id: string
  title: string | null
  description: string
  movement_date: string
}

export interface HearingWithContext extends Hearing {
  kind: Pick<HearingKind, 'id' | 'label'> | null
  event: HearingEvent | null
  legal_process: HearingProcess | null
  movement: HearingMovement | null
  /** Em `position`. Vazio até o checklist nascer. */
  checklist: HearingChecklistItem[]
}

export interface ChecklistProgress {
  /** Feitos ou "não se aplica". */
  resolved: number
  total: number
}

export function checklistProgress(hearing: Pick<HearingWithContext, 'checklist'>): ChecklistProgress {
  const total = hearing.checklist.length
  const resolved = hearing.checklist.filter((item) => item.done_at || item.skipped_at).length
  return { resolved, total }
}

/** Pronta para a audiência: o checklist nasceu e está todo resolvido, ou
 * alguém a marcou como pronta mesmo assim. */
export function isHearingReady(hearing: Pick<HearingWithContext, 'checklist' | 'checklist_generated_at' | 'ready_override_at'>): boolean {
  if (hearing.ready_override_at) return true
  if (!hearing.checklist_generated_at) return false
  const { resolved, total } = checklistProgress(hearing)
  return resolved === total
}

export interface HearingDateChange {
  id: string
  /** Nulo = a primeira data da audiência. */
  from_start_at: string | null
  to_start_at: string
  movement_id: string | null
  changed_by: string | null
  changed_at: string
  author: { full_name: string } | null
  movement: { movement_date: string } | null
}

export interface HearingDetail extends HearingWithContext {
  confirmed_by: { full_name: string } | null
  /** Mais antiga primeiro. */
  date_changes: HearingDateChange[]
}
