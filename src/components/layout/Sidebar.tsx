"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  CheckSquare,
  Scale,
  LogOut,
  FolderOpen,
  DollarSign,
  Settings,
  AlertCircle,
  Gavel,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { getRoleLabel } from "@/utils/profile";
import type { Resource } from "@/types/permission.types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClientesPendencies } from "@/features/clientes/hooks/useClientes";
import { useLegalProcessesPendencies } from "@/features/processos/hooks/useLegalProcesses";
import { useUnreadPublicationCount } from "@/features/publicacoes/hooks/usePublications";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Recurso correspondente em `role_permissions`. O item some do menu quando o
   * perfil não tem `view` sobre ele. Esconder é cosmético — quem barra a rota é
   * o `requirePermission()` da página, e o dado, a RLS. */
  resource: Resource;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Geral",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" },
      { href: "/crm", label: "CRM", icon: Briefcase, resource: "crm" },
      { href: "/processos", label: "Processos", icon: Gavel, resource: "processos" },
      { href: "/publicacoes", label: "Publicações", icon: Newspaper, resource: "publicacoes" },
      { href: "/agenda", label: "Agenda", icon: Calendar, resource: "agenda" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, resource: "clientes" },
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare, resource: "tarefas" },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, resource: "documentos" },
      { href: "/financeiro", label: "Financeiro", icon: DollarSign, resource: "financeiro" },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings, resource: "configuracoes" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, signOut } = useAuth();
  const { can, role, isLoading: loadingPermissions } = usePermissions();
  // O badge soma as duas fontes: contar só clientes esconderia um prazo sem
  // tarefa, que é a pendência mais cara da lista.
  const { data: clientPendencies = [] } = useClientesPendencies();
  const { data: processoPendencies = [] } = useLegalProcessesPendencies();

  // A fila de publicações não lidas é prazo correndo: ela precisa ser visível
  // sem abrir a tela, principalmente agora que a publicação chega sozinha.
  const { data: unreadPublications = 0 } = useUnreadPublicationCount();

  const pendencyCount = clientPendencies.length + processoPendencies.length;
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "AD";

  // Só os grupos que sobraram algum item depois do filtro — um cabeçalho
  // "Gestão" sozinho seria pior que a ausência dele.
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(item.resource, "view")),
    }))
    .filter((group) => group.items.length > 0);

  const visibleBottomItems = bottomItems.filter((item) =>
    can(item.resource, "view"),
  );

  function renderNavItem(
    href: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    badge?: number,
  ) {
    const active = pathname.startsWith(href);

    if (!sidebarOpen) {
      return (
        <Tooltip key={href}>
          <TooltipTrigger asChild>
            <Link
              href={href}
              className={cn(
                "relative flex w-full items-center justify-center rounded-lg p-2 transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary shadow-[inset_0_0_0_1px_var(--sidebar-accent)]"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {badge != null && badge > 0 && (
                <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-warning-foreground">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-primary font-semibold shadow-[inset_0_0_0_1px_var(--sidebar-accent)]"
            : "text-sidebar-foreground/60 font-medium hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")} />
        <span className="truncate flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground">
            {badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 shrink-0",
        sidebarOpen ? "w-56" : "w-14",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-3 gap-2.5">
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
            <Scale className="h-4 w-4" />
          </div>
          {sidebarOpen && (
            <span className="text-sm font-semibold tracking-wide text-sidebar-foreground truncate">
              AdvTool
            </span>
          )}
        </button>
      </div>

      {/* Navigation — enquanto as permissões carregam o menu fica vazio, em vez
          de mostrar tudo e retirar itens no frame seguinte. */}
      <nav className="flex-1 px-2 py-3.5 space-y-0.5 overflow-y-auto">
        {!loadingPermissions &&
          visibleGroups.map((group) => (
            <div key={group.label} className="mb-0.5">
              {sidebarOpen && (
                <div className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/40 first:pt-2">
                  {group.label}
                </div>
              )}
              {group.items.map(({ href, label, icon: Icon }) =>
                renderNavItem(
                  href,
                  label,
                  Icon,
                  href === "/publicacoes" ? unreadPublications : undefined,
                ),
              )}
            </div>
          ))}
      </nav>

      {/* Bottom nav — Pendências + Configurações */}
      {!loadingPermissions && (can("pendencias", "view") || visibleBottomItems.length > 0) && (
        <div className="px-2 pb-2 pt-1 space-y-0.5 border-t border-sidebar-border">
          {can("pendencias", "view") &&
            renderNavItem("/pendencias", "Pendências", AlertCircle, pendencyCount)}
          {visibleBottomItems.map(({ href, label, icon: Icon }) =>
            renderNavItem(href, label, Icon),
          )}
        </div>
      )}

      {/* User */}
      <div className="border-t border-sidebar-border px-2 py-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-semibold bg-sidebar-primary/20 text-sidebar-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-sidebar-foreground">
                {user?.email ?? "advogado@escritorio.adv.br"}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">
                {role ? getRoleLabel(role) : "AdvTool"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger
              className="flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
