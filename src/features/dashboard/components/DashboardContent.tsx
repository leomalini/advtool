"use client";

import { Fragment } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "./DashboardMetrics";
import { DashboardColumns } from "./DashboardColumns";
import { MonitoringCard } from "./MonitoringCard";
import { AgendaWeekCard } from "./AgendaWeekCard";
import { TasksCard } from "./TasksCard";
import { PrazosCard } from "./PrazosCard";
import { FinanceCard } from "./FinanceCard";
import { TeamCard } from "./TeamCard";
import { PortalCard } from "./PortalCard";
import { PendenciesCard } from "./PendenciesCard";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useCurrentProfile } from "@/hooks/useProfiles";
import { usePermissions } from "@/hooks/usePermissions";
import { getDisplayName } from "@/utils/profile";
import { pluralize } from "../utils/format";
import { ENTER_ANIMATION, enterDelay } from "../utils/motion";
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

/** The cards a role can see, in the order of the column. */
function visible(cards: (React.ReactElement | false)[]): React.ReactElement[] {
  return cards.filter((card): card is React.ReactElement => card !== false);
}

/**
 * Every card is gated on the permission of what it reads. Without it the RLS
 * answers with an empty list, and the card would show zeros — worse than not
 * showing up, because it reads as "the office has nothing there".
 *
 * Each card carries two placement classes: `order-*`, its position when the
 * two columns collapse into one (phone), and the entrance delay — staggered
 * by its place in the column.
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

  const main = visible([
    (can("processos", "view") || can("publicacoes", "view")) && (
      <MonitoringCard key="monitoring" className={cn("order-3", enterDelay(2))} />
    ),
    can("tarefas", "view") && <TasksCard key="tasks" className={cn("order-4", enterDelay(3))} />,
    can("financeiro", "view") && (
      <FinanceCard key="finance" className={cn("order-5", enterDelay(4))} />
    ),
  ]);

  const aside = visible([
    can("agenda", "view") && (
      <AgendaWeekCard key="agenda" className={cn("order-1", enterDelay(2))} />
    ),
    can("crm", "view") && <PrazosCard key="deadlines" className={cn("order-2", enterDelay(3))} />,
    can("pendencias", "view") && (
      <PendenciesCard key="pendencies" className={cn("order-6", enterDelay(4))} />
    ),
    can("clientes", "view") && <PortalCard key="portal" className={cn("order-7", enterDelay(5))} />,
    can("crm", "view") && <TeamCard key="team" className={cn("order-8", enterDelay(5))} />,
  ]);

  return (
    <div className="@container/dashboard space-y-4">
      {/* ── Cabeçalho do dia ── */}
      <div className={cn("space-y-1 pb-2", ENTER_ANIMATION)}>
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
      <DashboardMetrics className={cn(ENTER_ANIMATION, enterDelay(1))} />

      {/* `can()` responde false para tudo enquanto a matriz carrega: segurar as
          colunas evita os cards sumirem e voltarem. */}
      {permissionsLoading ? (
        <DashboardColumns
          main={[<Skeleton key="a" className="h-80 rounded-xl" />, <Skeleton key="b" className="h-64 rounded-xl" />]}
          aside={[<Skeleton key="c" className="h-64 rounded-xl" />]}
        />
      ) : (
        <DashboardColumns main={main} aside={aside} />
      )}
    </div>
  );
}
