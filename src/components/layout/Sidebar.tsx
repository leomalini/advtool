"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Contact,
  Calendar,
  CheckSquare,
  Scale,
  LogOut,
  FolderOpen,
  FileSignature,
  DollarSign,
  Settings,
  AlertCircle,
  Activity,
  Gavel,
  Landmark,
  Newspaper,
  Sparkles,
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
import { useActionRequiredMovementCount } from "@/features/movimentacoes/hooks/useMovements";
import { useHearingAttentionCount } from "@/features/audiencias/hooks/useHearings";

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
      // Movimentação é sub-entidade de processo (convenção da migration 36) e a
      // RLS da tabela responde a `processos:*` — daí o recurso repetido, em vez
      // de um `movimentacoes` que poderia abrir a tela sem poder ler o dado.
      { href: "/movimentacoes", label: "Movimentações", icon: Activity, resource: "processos" },
      { href: "/publicacoes", label: "Publicações", icon: Newspaper, resource: "publicacoes" },
      { href: "/agenda", label: "Agenda", icon: Calendar, resource: "agenda" },
      // A ficha responde à RLS de `agenda` (migration 76): mesmo recurso.
      { href: "/audiencias", label: "Audiências", icon: Landmark, resource: "agenda" },
      { href: "/ia", label: "Assistente", icon: Sparkles, resource: "ia" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, resource: "clientes" },
      // Mesma tabela de Clientes (migration 78) e, por isso, o mesmo recurso.
      { href: "/pessoas", label: "Pessoas", icon: Contact, resource: "clientes" },
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare, resource: "tarefas" },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, resource: "documentos" },
      { href: "/contratos", label: "Contratos", icon: FileSignature, resource: "contratos" },
      { href: "/financeiro", label: "Financeiro", icon: DollarSign, resource: "financeiro" },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings, resource: "configuracoes" },
];

// Classes em constantes no topo: o extrator do Tailwind perde classes escritas
// perto de JS com colchetes, e aqui elas também documentam o desenho
// (docs/redesign-visual.md).

/** Cartão flutuante. Redefine as variáveis de tecla para as teclas daqui de
 * dentro (item ativo, logo) combinarem com o fundo da sidebar. */
const SIDEBAR_FRAME =
  "flex shrink-0 flex-col overflow-hidden rounded-3xl bg-sidebar text-sidebar-foreground transition-[width] duration-300 shadow-[inset_0_1px_0_var(--sidebar-key-hl),0_0_0_1px_var(--sidebar-border),0_14px_30px_-14px_rgba(14,21,48,0.5)] [--key-hl:var(--sidebar-key-hl)] [--key-edge:var(--sidebar-border)] [--key-drop:var(--sidebar-key-drop)]";
/** Item ativo: tecla levantada. */
const ACTIVE_ITEM = "key key-sm bg-sidebar-accent text-sidebar-accent-foreground font-semibold";
const INACTIVE_ITEM =
  "text-sidebar-muted-foreground font-medium hover:bg-sidebar-accent/50 hover:text-sidebar-foreground";
/** Contador de prazo correndo: tecla cobalto com o número em fonte mono. */
const COUNTER =
  "flex items-center justify-center rounded-md bg-sidebar-primary font-mono font-medium text-sidebar-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_0_1px_var(--sidebar-border),0_1px_0_var(--sidebar-border)]";
/** Bloco do usuário: trilho rebaixado na cor da sidebar. */
const USER_WELL =
  "flex items-center gap-2 rounded-xl bg-[var(--sidebar-well)] p-2 shadow-[inset_0_1px_3px_var(--sidebar-well-shadow)]";

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

  // Mesma razão: o ato que manda manifestar é prazo correndo. Conta o backlog
  // inteiro, sem recorte de período — a tela abre filtrada, o badge não.
  const { data: actionRequiredMovements = 0 } = useActionRequiredMovementCount({
    enabled: can("processos", "view"),
  });

  // Audiência sem data, ou com a data lida do andamento e ainda não
  // conferida: as duas acabam descobertas no dia, se ninguém olhar antes.
  const { data: hearingsNeedingAttention = 0 } = useHearingAttentionCount({
    enabled: can("agenda", "view"),
  });

  const pendencyCount = clientPendencies.length + processoPendencies.length;

  /** Os únicos itens com contador. Função em vez de ternário encadeado no
   * render: a lista tende a crescer. */
  function badgeFor(href: string): number | undefined {
    if (href === "/publicacoes") return unreadPublications;
    if (href === "/movimentacoes") return actionRequiredMovements;
    if (href === "/audiencias") return hearingsNeedingAttention;
    return undefined;
  }
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
                active ? ACTIVE_ITEM : INACTIVE_ITEM,
              )}
            >
              <Icon className="h-4 w-4" />
              {badge != null && badge > 0 && (
                <span className={cn(COUNTER, "absolute top-0.5 right-0.5 h-3.5 min-w-3.5 px-0.5 text-[9px]")}>
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
          active ? ACTIVE_ITEM : INACTIVE_ITEM,
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active && "text-sidebar-ring")} />
        <span className="truncate flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span className={cn(COUNTER, "h-5 min-w-5 px-1 text-[10.5px]")}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className={cn(SIDEBAR_FRAME, sidebarOpen ? "w-56" : "w-14")}
    >
      {/* Logo */}
      <div className="flex h-14 items-center px-3 gap-2.5">
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <div className="key key-sm key-primary flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
            <Scale className="h-4 w-4" />
          </div>
          {sidebarOpen && (
            <span className="text-[15px] font-extrabold tracking-tight text-sidebar-foreground truncate">
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
                <div className="px-2.5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-muted-foreground/80 first:pt-2">
                  {group.label}
                </div>
              )}
              {group.items.map(({ href, label, icon: Icon }) =>
                renderNavItem(href, label, Icon, badgeFor(href)),
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
      <div className="p-2">
        {sidebarOpen ? (
          <div className={USER_WELL}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-bold bg-sidebar-primary text-sidebar-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-sidebar-foreground">
                {user?.email ?? "advogado@escritorio.adv.br"}
              </p>
              <p className="text-xs text-sidebar-muted-foreground truncate">
                {role ? getRoleLabel(role) : "AdvTool"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger
              className="flex w-full items-center justify-center rounded-md p-2 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
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
