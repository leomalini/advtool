'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState, useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}
import {
  Sun,
  Moon,
  Search,
  LayoutDashboard,
  Briefcase,
  Calendar,
  Users,
  CheckSquare,
  FolderOpen,
  DollarSign,
  Settings,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/crm': 'CRM',
  '/agenda': 'Agenda',
  '/clientes': 'Clientes',
  '/tarefas': 'Tarefas',
  '/documentos': 'Documentos',
  '/financeiro': 'Financeiro',
  '/configuracoes': 'Configurações',
  '/pendencias': 'Pendências',
}

const NAV_ROUTES = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Briefcase },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/documentos', label: 'Documentos', icon: FolderOpen },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { href: '/pendencias', label: 'Pendências', icon: AlertCircle },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] ?? ''

  function goTo(href: string) {
    setCommandOpen(false)
    router.push(href)
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
      <h1 className="text-[14.5px] font-semibold tracking-tight text-foreground shrink-0">
        {title}
      </h1>

      <button
        onClick={() => setCommandOpen(true)}
        className="ml-2 hidden min-w-[230px] items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 h-8 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted sm:flex"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Buscar…</span>
        <span className="rounded-sm bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {mounted && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Ir para…" />
        <CommandList>
          <CommandEmpty>Nenhuma página encontrada.</CommandEmpty>
          <CommandGroup heading="Navegação">
            {NAV_ROUTES.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={label} onSelect={() => goTo(href)}>
                <Icon className="h-4 w-4" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  )
}
