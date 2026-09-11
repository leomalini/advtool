'use client'

import { Circle, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskAgendaItem } from '../utils/agendaItem'

interface AgendaTaskCheckProps {
  item: TaskAgendaItem
  /** Ausente quando o perfil não pode alterar tarefas — o ícone só informa. */
  onToggle?: (item: TaskAgendaItem) => void
  className?: string
}

/**
 * O círculo da tarefa na Agenda, como no Google: vazio = pendente, marcado =
 * concluída. Clicar conclui ali mesmo, sem abrir o detalhe.
 */
export function AgendaTaskCheck({ item, onToggle, className }: AgendaTaskCheckProps) {
  const Icon = item.done ? CircleCheck : Circle

  if (!onToggle) return <Icon aria-hidden className={cn('shrink-0', className)} />

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={item.done ? `Reabrir "${item.title}"` : `Concluir "${item.title}"`}
      onClick={(e) => {
        // O chip em volta abre o detalhe; aqui só marca.
        e.stopPropagation()
        onToggle(item)
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className={className} />
    </button>
  )
}
