'use client'

import { Scale, Briefcase, CheckSquare, Users } from 'lucide-react'
import { MetricCard } from './MetricCard'
import { PrazosCard } from './PrazosCard'
import { AgendaHojeCard } from './AgendaHojeCard'
import { AreasChart } from './AreasChart'
import { AdvogadosCard } from './AdvogadosCard'
import { FinanceiroResumo } from './FinanceiroResumo'
import { ActivityFeed } from './ActivityFeed'
import { DASHBOARD_STATS } from '@/data/mock'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function getGreeting(): string {
  const hora = new Date().getHours()
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function DashboardContent() {
  const hoje = new Date()
  const dataFormatada = format(hoje, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-6">
      {/* ── Seção 1: Header do dia ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, Dr. 👋
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="capitalize">{dataFormatada}</span>
          <span className="text-border">·</span>
          <span>
            {DASHBOARD_STATS.audienciasProximas} audiências esta semana
          </span>
          <span className="text-border">·</span>
          <span>{DASHBOARD_STATS.prazosProximos} prazos próximos</span>
        </div>
      </div>

      {/* ── Seção 2: Cards de métricas ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Processos Ativos"
          value={DASHBOARD_STATS.casosAtivos}
          icon={Scale}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          trend="+2 esta semana"
          trendUp
        />
        <MetricCard
          label="Em Negociação"
          value={DASHBOARD_STATS.casosNegociacao}
          icon={Briefcase}
          iconColor="text-violet-600"
          iconBg="bg-violet-100"
          trend="+1 esta semana"
          trendUp
        />
        <MetricCard
          label="Tarefas Pendentes"
          value={DASHBOARD_STATS.tarefasPendentes}
          icon={CheckSquare}
          iconColor="text-amber-600"
          iconBg="bg-amber-100"
          trend="-1 hoje"
          trendUp={false}
        />
        <MetricCard
          label="Clientes Ativos"
          value={DASHBOARD_STATS.clientesAtivos}
          icon={Users}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          trend="+1 este mês"
          trendUp
        />
      </div>

      {/* ── Seção 3: Prazos + Agenda ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PrazosCard />
        <AgendaHojeCard />
      </div>

      {/* ── Seção 4: Áreas + Advogados + Financeiro ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AreasChart />
        <AdvogadosCard />
        <FinanceiroResumo />
      </div>

      {/* ── Seção 5: Feed de atividades ── */}
      <ActivityFeed />
    </div>
  )
}
