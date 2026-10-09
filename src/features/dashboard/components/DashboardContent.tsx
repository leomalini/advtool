"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DashboardMetrics } from "./DashboardMetrics";
import { DashboardColumns } from "./DashboardColumns";
import { TodayPanel } from "./TodayPanel";
import { MonitoringCard } from "./MonitoringCard";
import { TasksCard } from "./TasksCard";
import { PrazosCard } from "./PrazosCard";
import { FinanceCard } from "./FinanceCard";
import { TeamCard } from "./TeamCard";
import { PortalCard } from "./PortalCard";
import { PendenciesCard } from "./PendenciesCard";
import { CreditBalanceCard } from "./CreditBalanceCard";
import { usePermissions } from "@/hooks/usePermissions";
import { enterDelay } from "../utils/motion";

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
  const { can, isLoading: permissionsLoading } = usePermissions();

  const main = visible([
    (can("processos", "view") || can("publicacoes", "view")) && (
      <MonitoringCard key="monitoring" className={cn("order-2", enterDelay(2))} />
    ),
    can("tarefas", "view") && <TasksCard key="tasks" className={cn("order-3", enterDelay(3))} />,
    can("financeiro", "view") && (
      <FinanceCard key="finance" className={cn("order-4", enterDelay(4))} />
    ),
  ]);

  const aside = visible([
    can("crm", "view") && <PrazosCard key="deadlines" className={cn("order-1", enterDelay(2))} />,
    can("pendencias", "view") && (
      <PendenciesCard key="pendencies" className={cn("order-5", enterDelay(3))} />
    ),
    can("clientes", "view") && <PortalCard key="portal" className={cn("order-6", enterDelay(4))} />,
    can("crm", "view") && <TeamCard key="team" className={cn("order-7", enterDelay(5))} />,
    can("configuracoes", "view") && (
      <CreditBalanceCard key="credits" className={cn("order-8", enterDelay(6))} />
    ),
  ]);

  return (
    <div className="@container/dashboard space-y-4">
      {/* ── Hoje: saudação, o dia e os próximos 7 dias ── */}
      <TodayPanel />

      {/* ── Indicadores ── */}
      {/* Sem indicador de tendência: não guardamos histórico para comparar
          períodos, e um número inventado aqui seria pior que nenhum. */}
      <DashboardMetrics />

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
