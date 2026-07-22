'use client'

import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

export function Header() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] ?? ''

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>

      {mounted && (
        <Button
          variant="ghost"
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
    </header>
  )
}
