'use client'

import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Um item da faixa de informações que fica sob o cabeçalho das páginas de
 * detalhe. Compartilhado entre Processo e Cliente: as duas faixas mostram
 * coisas diferentes, mas com a mesma anatomia (ícone, rótulo miúdo, valor).
 */
export function InfoStripItem({
  icon,
  label,
  value,
  valueClassName,
  children,
}: {
  icon: React.ReactNode
  label: string
  /** Texto simples. Ignorado quando `children` é passado. */
  value?: string | null
  valueClassName?: string
  /** Para valores que não são texto puro — um link, um botão de copiar. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex-1 min-w-0 px-4 py-3 border-r border-border last:border-r-0">
      <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {children ?? (
        <p className={cn('text-sm font-semibold text-foreground truncate', valueClassName)}>
          {value || '—'}
        </p>
      )}
    </div>
  )
}

/**
 * Cartão de atalho — abre a aba correspondente e oferece a ação de criar.
 * A contagem vem da mesma query que alimenta a aba, para o número no cartão
 * nunca discordar do que a aba mostra ao ser aberta.
 */
export function ActionCard({
  icon,
  label,
  count,
  actionLabel,
  onAction,
  onOpen,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  count: number
  actionLabel: string
  onAction: () => void
  onOpen: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2 text-sm font-medium hover:text-accent-foreground transition-colors"
      >
        {icon}
        {label}
        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
          {count}
        </span>
      </button>
      <Button size="sm" onClick={onAction} disabled={disabled}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        {actionLabel}
      </Button>
    </div>
  )
}
