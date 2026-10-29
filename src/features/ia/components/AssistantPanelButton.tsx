'use client'

import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/usePermissions'
import { useAssistantPanelStore } from '../stores/assistantPanel.store'
import { isAssistantPage } from './AssistantPanel'

/** O botão do Header que abre e fecha o painel do Assistente. */
export function AssistantPanelButton() {
  const pathname = usePathname()
  const { can, isLoading } = usePermissions()
  const open = useAssistantPanelStore((state) => state.open)
  const toggle = useAssistantPanelStore((state) => state.toggle)

  if (isLoading || !can('ia', 'view') || isAssistantPage(pathname)) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'h-8 gap-1.5 text-muted-foreground hover:text-foreground',
        open && 'bg-accent text-foreground',
      )}
      onClick={toggle}
      aria-pressed={open}
      title="Assistente (Ctrl+J)"
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">Assistente</span>
    </Button>
  )
}
