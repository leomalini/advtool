"use client";

import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardMetrics } from "./DashboardMetrics";
import { DashboardRow } from "./DashboardRow";
import { MonitoringCard } from "./MonitoringCard";
import { AgendaWeekCard } from "./AgendaWeekCard";
import { TasksCard } from "./TasksCard";
import { PrazosCard } from "./PrazosCard";
import { AreasChart } from "./AreasChart";
import { AdvogadosCard } from "./AdvogadosCard";
import { FinanceiroResumo } from "./FinanceiroResumo";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useCurrentProfile } from "@/hooks/useProfiles";
import { usePermissions } from "@/hooks/usePermissions";
import { getDisplayName } from "@/utils/profile";
import { pluralize } from "../utils/format";
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

/**
 * Every card is gated on the permission of what it reads. Without it the RLS
 * answers with an empty list, and the card would show zeros — worse than not
 * showing up, because it reads as "the office has nothing there".
 */
export function DashboardContent() {
  const { data: stats } = useDashboardStats();
  const profile = useCurrentProfile();
  const { can, isLoading: permissionsLoading } = usePermissions();

  const hoje = new Date();
  const dataFormatada = format(hoje, "EEEE, dd 'de' MMMM 'de' yyyy", {
    locale: ptBR,
  });

  // Each half of the line counts a different table, so each one carries the
  // permission of its own.
  const resumoDaSemana = stats
    ? [
        can("agenda", "view") &&
          pluralize(stats.weekly_hearings, "audiência esta semana", "audiências esta semana"),
        can("crm", "view") &&
          pluralize(stats.upcoming_deadlines, "prazo próximo", "prazos próximos"),
      ].filter((frase): frase is string => Boolean(frase))
    : [];

  return (
    <div className="space-y-6">
      {/* ── Cabeçalho do dia ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}
          {profile ? `, ${firstName(profile.full_name)}` : ""} 👋
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="capitalize">{dataFormatada}</span>
          {resumoDaSemana.map((frase) => (
            <Fragment key={frase}>
              <span className="text-border">·</span>
              <span>{frase}</span>
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Indicadores ── */}
      {/* Sem indicador de tendência: não guardamos histórico para comparar
          períodos, e um número inventado aqui seria pior que nenhum. */}
      <DashboardMetrics />

      {/* `can()` responde false para tudo enquanto a matriz carrega: segurar as
          linhas evita os cards sumirem e voltarem. */}
      {permissionsLoading ? (
        <DashboardRow>
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </DashboardRow>
      ) : (
        <>
          {/* ── Monitoramento + Agenda ── */}
          <DashboardRow>
            {(can("processos", "view") || can("publicacoes", "view")) && (
              <MonitoringCard className="lg:col-span-7" />
            )}
            {can("agenda", "view") && <AgendaWeekCard className="lg:col-span-5" />}
          </DashboardRow>

          {/* ── Tarefas + Prazos ── */}
          <DashboardRow>
            {can("tarefas", "view") && <TasksCard />}
            {can("crm", "view") && <PrazosCard />}
          </DashboardRow>

          {/* ── Financeiro + Áreas + Advogados ── */}
          <DashboardRow>
            {can("financeiro", "view") && <FinanceiroResumo />}
            {can("crm", "view") && <AreasChart />}
            {can("crm", "view") && <AdvogadosCard />}
          </DashboardRow>
        </>
      )}
    </div>
  );
}
