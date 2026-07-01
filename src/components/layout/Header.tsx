'use client'

import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/crm': 'CRM',
  '/agenda': 'Agenda',
  '/clientes': 'Clientes',
  '/tarefas': 'Tarefas',
  '/documentos': 'Documentos',
  '/financeiro': 'Financeiro',
  '/configuracoes': 'Configurações',
}

export function Header() {
  const pathname = usePathname()
  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] ?? ''

  return (
    <header className="flex h-14 items-center border-b bg-background px-6">
      <h1 className="text-base font-semibold">{title}</h1>
    </header>
  )
}
