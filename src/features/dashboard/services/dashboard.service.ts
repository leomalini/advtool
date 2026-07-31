import { createClient } from '@/lib/supabase/client'
import type { DashboardStats } from '@/types/activity.types'
import type { Activity } from '@/types/activity.types'
import type { CalendarEvent } from '@/types/event.types'
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns'

const supabase = createClient()

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

  const [processes, negotiations, tasks, clients, hearings, deadlines] = await Promise.all([
    supabase.from('legal_processes').select('id', { count: 'exact', head: true }),
    supabase
      .from('crm_items')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', 'wf-negociacao'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'done'),
    supabase.from('clients').select('id', { count: 'exact', head: true }),
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
    legal_processes: processes.count ?? 0,
    negotiations: negotiations.count ?? 0,
    pending_tasks: tasks.count ?? 0,
    active_clients: clients.count ?? 0,
    weekly_hearings: hearings.count ?? 0,
    upcoming_deadlines: deadlines.count ?? 0,
  }
}

/** Events from now onwards, for the "Próximos Eventos" card. Only events
 * flagged to show in the agenda — the same filter the calendar page uses. */
export async function getUpcomingEvents(limit = 6): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*, assignee:profiles!events_assigned_to_fkey(id, full_name, avatar_url, role, created_at), client:clients(id, type, name, company_name, trade_name)')
    .eq('show_in_agenda', true)
    .gte('start_at', new Date().toISOString())
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

export async function getRecentActivities(limit = 20): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      actor:profiles!activities_actor_id_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data as Activity[]
}
