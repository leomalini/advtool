import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { LegalProcessMovementWithContext } from '@/types/legalProcess.types'
import type { Publication } from '@/types/publication.types'
// Só o tipo: `import type` some na compilação, e nada do módulo de servidor vai
// para o navegador.
import type { DashboardWebhookHealth } from '@/lib/buscaprocessos/webhookHealth'
import type { CreditBalance } from '@/lib/buscaprocessos/creditBalance'
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'

const supabase = createClient()

/** Rows read to split the overdue tasks by age — far more than an office
 * leaves late; past it the oldest ones still count. */
const OVERDUE_AGES_CAP = 1000

/** A busy office gets dozens of publications a day; two weeks fit. */
const PUBLICATIONS_PER_DAY_CAP = 2000

/** How far back the monitoring card looks — docs/dashboard.md, decision 4. */
export const MONITORING_WINDOW_DAYS = 7

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
  /** The overdue ones by how late they are — up to a week, up to a month,
   * older. A pile of month-old tasks is a different problem from yesterday's. */
  overdueByAge: { week: number; month: number; older: number }
  /** Days since the oldest overdue due date; `null` when nothing is late. */
  oldestOverdueDays: number | null
}

/** One bar of a daily series. */
export interface DailyCount {
  /** 'yyyy-MM-dd' */
  day: string
  count: number
}

/** How many days the publications indicator draws. */
export const PUBLICATION_DAYS = 14

/** The client columns the lists embed — just enough for a name. */
interface ClientNameFields {
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

function clientDisplayName(client: ClientNameFields | null): string | null {
  if (!client) return null
  return client.type === 'individual' ? client.name : (client.trade_name ?? client.company_name)
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
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const today = parseISO(todayKey)

  const [overdue, dueToday] = await Promise.all([
    // The rows too, oldest first, for the ages; the count stays exact even
    // past the cap.
    supabase
      .from('tasks')
      .select('due_date', { count: 'exact' })
      .neq('status', 'done')
      .lt('due_date', todayKey)
      .order('due_date')
      .limit(OVERDUE_AGES_CAP),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'done')
      .eq('due_date', todayKey),
  ])

  const rows = (overdue.data ?? []) as { due_date: string }[]
  const daysLate = (row: { due_date: string }) => differenceInCalendarDays(today, parseISO(row.due_date))
  const overdueByAge = { week: 0, month: 0, older: 0 }
  for (const row of rows) {
    const days = daysLate(row)
    if (days <= 7) overdueByAge.week += 1
    else if (days <= 30) overdueByAge.month += 1
    else overdueByAge.older += 1
  }

  return {
    overdue: countOf(overdue),
    dueToday: countOf(dueToday),
    overdueByAge,
    oldestOverdueDays: rows.length > 0 ? daysLate(rows[0]) : null,
  }
}

/** Publications per day (by `publication_date`, duplicates out), oldest day
 * first, today last — the arrivals behind the unread count. */
export async function getPublicationsPerDay(days = PUBLICATION_DAYS): Promise<DailyCount[]> {
  const now = new Date()
  const first = format(subDays(now, days - 1), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('publications')
    .select('publication_date')
    .is('duplicate_of_id', null)
    .gte('publication_date', first)
    .limit(PUBLICATIONS_PER_DAY_CAP)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { publication_date: string }[]) {
    counts.set(row.publication_date, (counts.get(row.publication_date) ?? 0) + 1)
  }
  return Array.from({ length: days }, (_, index) => {
    const day = format(subDays(now, days - 1 - index), 'yyyy-MM-dd')
    return { day, count: counts.get(day) ?? 0 }
  })
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

/** The head of the unread queue, in the order `/publicacoes` lists it —
 * or only its orphans (no processo registered for the CNJ). */
export async function getUnreadPublicationsPreview({
  limit = 5,
  orphansOnly = false,
}: { limit?: number; orphansOnly?: boolean } = {}): Promise<PublicationPreview[]> {
  let query = supabase
    .from('publications')
    .select('id, sequence_number, cnj_number, legal_process_id, diario_sigla, title, publication_date, created_at')
    .is('duplicate_of_id', null)
    .is('read_at', null)
  if (orphansOnly) query = query.is('legal_process_id', null)

  const { data, error } = await query
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

/** The BuscaProcessos credit balance — through our route, which holds the
 * API key. */
export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await fetch('/api/buscaprocessos/saldo')
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok || body === null) {
    const message = (body as { error?: string } | null)?.error
    throw new Error(message ?? 'Não foi possível ler o saldo de créditos.')
  }
  return body as CreditBalance
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
    client: ClientNameFields | null
    assigned_profile: { full_name: string } | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    crm_item_id: row.id,
    legal_process_id: row.legal_process_id,
    title: row.title ?? 'Sem título',
    client_name: clientDisplayName(row.client),
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

// ── Portal do cliente ────────────────────────────────────────────────────────

export const PORTAL_WINDOW_DAYS = 30

/** Right link, wrong document — or too many tries. Someone holding a link and
 * guessing the document is the attempt worth seeing; an invalid or revoked
 * token is noise (an old link, a scanner). */
const REFUSED_OUTCOMES = ['document_mismatch', 'rate_limited'] as const

export interface PortalAccess {
  clientId: string | null
  clientName: string | null
  at: string
}

export interface PortalAccessSummary {
  /** Accesses granted in the window. */
  granted: number
  /** Distinct clients among them. */
  clients: number
  refused: number
  /** Latest granted accesses, newest first. */
  recent: PortalAccess[]
  /** Links that still open: not revoked and not expired. */
  activeLinks: number
  /** Granted accesses per local day over the window, today last. */
  daily: DailyCount[]
}

/** Plenty for a month of a small office; the card prints three accesses. */
const PORTAL_LOG_CAP = 500

export async function getPortalAccessSummary(): Promise<PortalAccessSummary> {
  const now = new Date()
  const since = subDays(now, PORTAL_WINDOW_DAYS).toISOString()

  const [log, links] = await Promise.all([
    supabase
      .from('client_portal_access_log')
      .select('outcome, client_id, created_at, client:clients(type, name, company_name, trade_name)')
      .in('outcome', ['granted', ...REFUSED_OUTCOMES])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(PORTAL_LOG_CAP),
    supabase
      .from('client_portal_links')
      .select('id', { count: 'exact', head: true })
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt."${now.toISOString()}"`),
  ])

  if (log.error) throw log.error

  type Row = {
    outcome: string
    client_id: string | null
    created_at: string
    client: ClientNameFields | null
  }
  const rows = (log.data ?? []) as unknown as Row[]
  const granted = rows.filter((row) => row.outcome === 'granted')

  const perDay = new Map<string, number>()
  for (const row of granted) {
    const day = format(parseISO(row.created_at), 'yyyy-MM-dd')
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }
  const daily = Array.from({ length: PORTAL_WINDOW_DAYS }, (_, index) => {
    const day = format(subDays(now, PORTAL_WINDOW_DAYS - 1 - index), 'yyyy-MM-dd')
    return { day, count: perDay.get(day) ?? 0 }
  })

  return {
    granted: granted.length,
    clients: new Set(granted.map((row) => row.client_id).filter(Boolean)).size,
    refused: rows.length - granted.length,
    recent: granted.slice(0, 3).map((row) => ({
      clientId: row.client_id,
      clientName: clientDisplayName(row.client),
      at: row.created_at,
    })),
    activeLinks: countOf(links),
    daily,
  }
}
