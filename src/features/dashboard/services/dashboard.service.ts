import { createClient } from '@/lib/supabase/client'
import type { DashboardStats } from '@/types/activity.types'
import type { Activity } from '@/types/activity.types'
import { startOfWeek, endOfWeek, format } from 'date-fns'

const supabase = createClient()

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date()
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ssxxx")
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ssxxx")

  const [casesResult, meetingsResult, tasksResult, clientsResult] = await Promise.all([
    supabase
      .from('crm_items')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'meeting')
      .gte('start_at', weekStart)
      .lte('start_at', weekEnd),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'done'),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true }),
  ])

  return {
    active_cases: casesResult.count ?? 0,
    weekly_meetings: meetingsResult.count ?? 0,
    pending_tasks: tasksResult.count ?? 0,
    active_clients: clientsResult.count ?? 0,
  }
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
