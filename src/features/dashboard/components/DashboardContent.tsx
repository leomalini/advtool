'use client'

import { Briefcase, Calendar, CheckSquare, Users } from 'lucide-react'
import { StatsCard } from './StatsCard'
import { ActivityFeed } from './ActivityFeed'
import { useDashboardStats } from '../hooks/useDashboardStats'

export function DashboardContent() {
  const { data: stats, isLoading } = useDashboardStats()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Leads Ativos"
          value={stats?.active_leads}
          icon={Briefcase}
          color="bg-violet-500"
          loading={isLoading}
        />
        <StatsCard
          label="Reuniões na Semana"
          value={stats?.weekly_meetings}
          icon={Calendar}
          color="bg-cyan-500"
          loading={isLoading}
        />
        <StatsCard
          label="Tarefas Pendentes"
          value={stats?.pending_tasks}
          icon={CheckSquare}
          color="bg-amber-500"
          loading={isLoading}
        />
        <StatsCard
          label="Clientes Ativos"
          value={stats?.active_clients}
          icon={Users}
          color="bg-emerald-500"
          loading={isLoading}
        />
      </div>

      <ActivityFeed />
    </div>
  )
}
