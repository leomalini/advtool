'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { useMounted } from '@/hooks/useMounted'
import {
  Sun,
  Moon,
  Search,
  LayoutDashboard,
  Briefcase,
  Calendar,
  Users,
  Contact,
  CheckSquare,
  FolderOpen,
  FileSignature,
  DollarSign,
  Settings,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/features/notificacoes/components/NotificationBell'
import { AssistantPanelButton } from '@/features/ia/components/AssistantPanelButton'
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
  '/ia': 'Assistente',
  '/processos': 'Processos',
  '/clientes': 'Clientes',
  '/pessoas': 'Pessoas',
  '/tarefas': 'Tarefas',
  '/documentos': 'Documentos',
  '/contratos': 'Contratos',
  '/financeiro': 'Financeiro',
  '/configuracoes': 'Configurações',
  '/pendencias': 'Pendências',
}

const NAV_ROUTES = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Briefcase },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/pessoas', label: 'Pessoas', icon: Contact },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/documentos', label: 'Documentos', icon: FolderOpen },
  { href: '/contratos', label: 'Contratos', icon: FileSignature },
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
    <header className="flex h-14 shrink-0 items-center gap-3 px-6">
      <h1 className="text-lg font-extrabold tracking-tight text-foreground shrink-0">
        {title}
      </h1>

      <button
        onClick={() => setCommandOpen(true)}
        className="well ml-auto hidden h-9 min-w-[260px] items-center gap-2 rounded-full bg-muted px-3.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground sm:flex"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Buscar…</span>
        <span className="key key-sm rounded-md bg-key px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</span>
      </button>

      <div className="ml-auto flex items-center gap-2 sm:ml-0">
        <AssistantPanelButton />

        {/* O sino carrega a assinatura do Realtime, e o Header está montado em
            toda rota do app — é o que faz a publicação recebida por webhook
            avisar quem está em qualquer tela. */}
        <NotificationBell />

        {mounted && (
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-full text-muted-foreground hover:text-foreground"
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
