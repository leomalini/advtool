"use client";

import { Scale, Briefcase, CheckSquare, Users } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { PrazosCard } from "./PrazosCard";
import { AgendaHojeCard } from "./AgendaHojeCard";
import { AreasChart } from "./AreasChart";
import { AdvogadosCard } from "./AdvogadosCard";
import { FinanceiroResumo } from "./FinanceiroResumo";
import { ActivityFeed } from "./ActivityFeed";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useCurrentProfile } from "@/hooks/useProfiles";
import { getDisplayName } from "@/utils/profile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function getGreeting(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** First name only — "Bom dia, Ana" reads better than the full legal name.
 * Goes through getDisplayName because seeded profiles may hold an e-mail. */
function firstName(fullName: string): string {
  return getDisplayName(fullName).trim().split(/\s+/)[0];
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function DashboardContent() {
  const { data: stats } = useDashboardStats();
  const profile = useCurrentProfile();

  const hoje = new Date();
  const dataFormatada = format(hoje, "EEEE, dd 'de' MMMM 'de' yyyy", {
    locale: ptBR,
  });

  return (
    <div className="space-y-6">
      {/* ── Seção 1: Header do dia ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}
          {profile ? `, ${firstName(profile.full_name)}` : ""} 👋
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="capitalize">{dataFormatada}</span>
          {stats && (
            <>
              <span className="text-border">·</span>
              <span>
                {pluralize(
                  stats.weekly_hearings,
                  "audiência esta semana",
                  "audiências esta semana",
                )}
              </span>
              <span className="text-border">·</span>
              <span>
                {pluralize(
                  stats.upcoming_deadlines,
                  "prazo próximo",
                  "prazos próximos",
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Seção 2: Cards de métricas ── */}
      {/* Sem indicador de tendência: não guardamos histórico para comparar
          períodos, e um número inventado aqui seria pior que nenhum. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Processos"
          value={stats?.legal_processes ?? 0}
          icon={Scale}
          variant="accent"
        />
        <MetricCard
          label="Em Negociação"
          value={stats?.negotiations ?? 0}
          icon={Briefcase}
          variant="chart2"
        />
        <MetricCard
          label="Tarefas Pendentes"
          value={stats?.pending_tasks ?? 0}
          icon={CheckSquare}
          variant="warning"
        />
        <MetricCard
          label="Clientes"
          value={stats?.active_clients ?? 0}
          icon={Users}
          variant="success"
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
  );
}
