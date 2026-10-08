import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { CalendarEvent } from '@/types/event.types'
import type { LegalProcessMovementWithContext } from '@/types/legalProcess.types'
import type { Publication } from '@/types/publication.types'
// Só o tipo: `import type` some na compilação, e nada do módulo de servidor vai
// para o navegador.
import type { DashboardWebhookHealth } from '@/lib/buscaprocessos/webhookHealth'
import { startOfWeek, endOfWeek, startOfDay, addDays, subDays, format } from 'date-fns'

const supabase = createClient()

/** How far back the monitoring card looks — docs/dashboard.md, decision 4. */
export const MONITORING_WINDOW_DAYS = 7

/** The header line under the greeting. */
export interface DashboardStats {
  /** Hearings scheduled for the current week. */
  weekly_hearings: number
  /** Deadlines falling within the next 7 days (overdue ones included). */
  upcoming_deadlines: number
}

/** The "Processos ativos" indicator. */
export interface ProcessCounts {
  active: number
  /** Active ones with a BuscaProcessos monitor attached (`monitoring_id`). */
  monitored: number
}

/** The "Tarefas atrasadas" indicator. */
export interface TaskCounts {
  /** Not done, due before today. */
  overdue: number
  /** Not done, due today. */
  dueToday: number
}

/** Count of a `head` request. A failed count throws instead of reading as
 * zero — on the dashboard, a made-up zero is worse than no number at all. */
function countOf(result: { count: number | null; error: PostgrestError | null }): number {
  if (result.error) throw result.error
  return result.count ?? 0
}

/** A crm_item deadline, flattened with just what the dashboard card renders. */
export interface UpcomingDeadline {
  crm_item_id: string
  legal_process_id: string | null
  title: string
  client_name: string | null
  legal_area: string | null
  next_deadline: string
  next_task_summary: string | null
  assigned_name: string | null
}

export interface LegalAreaCount {
  legal_area: string
  count: number
}

/** Case counts per assignee, keyed by profile id. Profiles with no cases are
 * absent — the card fills them in from the profiles list. */
export type WorkloadByAssignee = Record<
  string,
  { total: number; byWorkflow: Record<string, number> }
>

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date()
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ssxxx")
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ssxxx")
  const inSevenDays = format(addDays(now, 7), 'yyyy-MM-dd')

  const [hearings, deadlines] = await Promise.all([
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'hearing')
      .gte('start_at', weekStart)
      .lte('start_at', weekEnd),
    supabase
      .from('crm_items')
      .select('id', { count: 'exact', head: true })
      .not('next_deadline', 'is', null)
      .lte('next_deadline', inSevenDays),
  ])

  return {
    weekly_hearings: countOf(hearings),
    upcoming_deadlines: countOf(deadlines),
  }
}

export async function getProcessCounts(): Promise<ProcessCounts> {
  const [active, monitored] = await Promise.all([
    supabase
      .from('legal_processes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativo'),
    supabase
      .from('legal_processes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .not('monitoring_id', 'is', null),
  ])

  return { active: countOf(active), monitored: countOf(monitored) }
}

/** Open tasks are not counted on purpose: a recurring series is created with
 * all its occurrences up front (up to `MAX_OCCURRENCES` in src/lib/recurrence),
 * so "N abertas" would count next year's ones too. Overdue and today mean the
 * same with or without series. */
export async function getTaskCounts(): Promise<TaskCounts> {
  // `due_date` is a plain date: compared to the local day, as the Agenda does.
  // Computed here, not by the caller, so the minute refetch picks up midnight.
  const today = format(new Date(), 'yyyy-MM-dd')

  const [overdue, dueToday] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'done')
      .lt('due_date', today),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'done')
      .eq('due_date', today),
  ])

  return { overdue: countOf(overdue), dueToday: countOf(dueToday) }
}

/** Unread publications of processos nobody registered — the same queue as
 * `countUnreadPublications`, narrowed to the orphans. */
export async function getUnreadOrphanPublicationCount(): Promise<number> {
  const result = await supabase
    .from('publications')
    .select('id', { count: 'exact', head: true })
    .is('duplicate_of_id', null)
    .is('read_at', null)
    .is('legal_process_id', null)

  return countOf(result)
}

// ── Monitoramento ────────────────────────────────────────────────────────────

/** A movement as the monitoring card reads it — `raw_data` and the rest of the
 * row stay behind; the description alone is often a long court text. */
export type WebhookMovement = Pick<
  LegalProcessMovementWithContext,
  'id' | 'legal_process_id' | 'movement_date' | 'title' | 'description' | 'created_at' | 'legal_process'
>

export interface WebhookMovementsResult {
  /** Newest arrival first. */
  movements: WebhookMovement[]
  /** The cap was hit: the oldest arrivals of the window were left out, so the
   * counts per processo may be short. */
  truncated: boolean
}

/** Plenty for a week of a small office (the busiest processo got 42 in a month
 * in 2026); the card prints five processos either way. */
const WEBHOOK_MOVEMENTS_CAP = 300

/** What the monitoring webhook delivered in the window. Only `received_via =
 * 'webhook'`: registering a processo imports its whole history at once, and
 * that is not news (migration 68). */
export async function getWebhookMovements(): Promise<WebhookMovementsResult> {
  const since = subDays(new Date(), MONITORING_WINDOW_DAYS).toISOString()

  const { data, error } = await supabase
    .from('legal_process_movements')
    .select(`
      id, legal_process_id, movement_date, title, description, created_at,
      legal_process:legal_processes(
        id, cnj_number, court,
        crm_items:crm_items!crm_items_legal_process_id_fkey(id, workflow_id, title, client:clients(type, name, company_name, trade_name))
      )
    `)
    .eq('received_via', 'webhook')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(WEBHOOK_MOVEMENTS_CAP)

  if (error) throw error

  const movements = (data ?? []) as unknown as WebhookMovement[]
  return { movements, truncated: movements.length === WEBHOOK_MOVEMENTS_CAP }
}

export type PublicationPreview = Pick<
  Publication,
  | 'id'
  | 'sequence_number'
  | 'cnj_number'
  | 'legal_process_id'
  | 'diario_sigla'
  | 'title'
  | 'publication_date'
  | 'created_at'
>

/** The head of the unread queue, in the order `/publicacoes` lists it. */
export async function getUnreadPublicationsPreview(limit = 5): Promise<PublicationPreview[]> {
  const { data, error } = await supabase
    .from('publications')
    .select('id, sequence_number, cnj_number, legal_process_id, diario_sigla, title, publication_date, created_at')
    .is('duplicate_of_id', null)
    .is('read_at', null)
    .order('publication_date', { ascending: false })
    .order('sequence_number', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as PublicationPreview[]
}

/** The integration strip, from `GET /api/webhooks/health` — a route because
 * "pending refusal" is defined server-side, next to the replay. */
export async function getWebhookHealth(): Promise<DashboardWebhookHealth> {
  const response = await fetch('/api/webhooks/health')
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok || body === null) {
    const message = (body as { error?: string } | null)?.error
    throw new Error(message ?? 'Não foi possível ler as entregas do webhook.')
  }
  return body as DashboardWebhookHealth
}

/** Events that haven't ended yet, for the "Próximos Eventos" card. Only events
 * flagged to show in the agenda — the same filter the calendar page uses.
 *
 * "Not ended", not "not started": filtering on `start_at >= now` dropped an
 * event in progress, and today's all-day events as soon as their start passed.
 * All-day `end_at` is midnight of the last day (inclusive), so those are kept
 * through the whole of that day. */
export async function getUpcomingEvents(limit = 6): Promise<CalendarEvent[]> {
  const now = new Date()
  const nowIso = now.toISOString()
  const todayStartIso = startOfDay(now).toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('*, assignee:profiles!events_assigned_to_fkey(id, full_name, avatar_url, role, created_at), client:clients(id, type, name, company_name, trade_name)')
    .eq('show_in_agenda', true)
    .or(`end_at.gte."${nowIso}",and(all_day.eq.true,end_at.gte."${todayStartIso}")`)
    .order('start_at')
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as CalendarEvent[]
}

/** Case counts per legal area, for the areas chart. Items with no area set
 * are dropped — the chart is about distribution across known areas. */
export async function getCasesByLegalArea(): Promise<LegalAreaCount[]> {
  const { data, error } = await supabase.from('crm_items').select('legal_area')
  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { legal_area: string | null }[]) {
    if (!row.legal_area) continue
    counts.set(row.legal_area, (counts.get(row.legal_area) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([legal_area, count]) => ({ legal_area, count }))
    .sort((a, b) => b.count - a.count)
}

/** Upcoming (and overdue) deadlines across all crm_items. Overdue ones are
 * included on purpose — a missed deadline is the most urgent thing to show. */
export async function getUpcomingDeadlines(limit = 5): Promise<UpcomingDeadline[]> {
  const { data, error } = await supabase
    .from('crm_items')
    .select(`
      id, title, legal_area, next_deadline, next_task_summary, legal_process_id,
      client:clients(type, name, company_name, trade_name),
      assigned_profile:profiles!crm_items_assigned_to_fkey(full_name)
    `)
    .not('next_deadline', 'is', null)
    .order('next_deadline')
    .limit(limit)

  if (error) throw error

  type Row = {
    id: string
    title: string | null
    legal_area: string | null
    next_deadline: string
    next_task_summary: string | null
    legal_process_id: string | null
    client: {
      type: 'individual' | 'company'
      name: string | null
      company_name: string | null
      trade_name: string | null
    } | null
    assigned_profile: { full_name: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    crm_item_id: row.id,
    legal_process_id: row.legal_process_id,
    title: row.title ?? 'Sem título',
    client_name: row.client
      ? row.client.type === 'individual'
        ? row.client.name
        : (row.client.trade_name ?? row.client.company_name)
      : null,
    legal_area: row.legal_area,
    next_deadline: row.next_deadline,
    next_task_summary: row.next_task_summary,
    assigned_name: row.assigned_profile?.full_name ?? null,
  }))
}

export async function getWorkloadByAssignee(): Promise<WorkloadByAssignee> {
  const { data, error } = await supabase
    .from('crm_items')
    .select('assigned_to, workflow_id')
    .not('assigned_to', 'is', null)

  if (error) throw error

  const workload: WorkloadByAssignee = {}
  for (const row of (data ?? []) as { assigned_to: string; workflow_id: string }[]) {
    const entry = (workload[row.assigned_to] ??= { total: 0, byWorkflow: {} })
    entry.total += 1
    entry.byWorkflow[row.workflow_id] = (entry.byWorkflow[row.workflow_id] ?? 0) + 1
  }
  return workload
}
