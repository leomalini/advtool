'use client'

import { Loader2 } from 'lucide-react'

interface DeletionImpactNoticeProps {
  impact?: {
    comments: number
    events: number
    tasks: number
    movements?: number
  }
  isLoading?: boolean
}

/** Both forms are passed in — Portuguese plurals aren't a suffix rule
 * ("movimentação" → "movimentações"). */
function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/**
 * Spells out what a deletion takes with it.
 *
 * The two lists are separate on purpose: comments and movements are gone for
 * good, while events and tasks stay in the agenda and the task board with the
 * link cleared. Collapsing them into one sentence would misrepresent both.
 */
export function DeletionImpactNotice({ impact, isLoading }: DeletionImpactNoticeProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando o que será afetado...
      </div>
    )
  }

  if (!impact) return null

  const destroyed: string[] = []
  if (impact.comments > 0) destroyed.push(plural(impact.comments, 'comentário', 'comentários'))
  if (impact.movements && impact.movements > 0) {
    destroyed.push(plural(impact.movements, 'movimentação', 'movimentações'))
  }

  const unlinked: string[] = []
  if (impact.events > 0) unlinked.push(plural(impact.events, 'evento', 'eventos'))
  if (impact.tasks > 0) unlinked.push(plural(impact.tasks, 'tarefa', 'tarefas'))

  if (destroyed.length === 0 && unlinked.length === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-3">
        Nenhum evento, tarefa ou comentário vinculado.
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      {destroyed.length > 0 && (
        <p className="text-xs text-foreground/80">
          <span className="font-medium text-destructive">Também serão excluídos:</span>{' '}
          {destroyed.join(' e ')}.
        </p>
      )}
      {unlinked.length > 0 && (
        <p className="text-xs text-foreground/80">
          <span className="font-medium">Ficarão sem vínculo:</span> {unlinked.join(' e ')} — seguem
          na Agenda e em Tarefas, mas sem referência a este registro.
        </p>
      )}
    </div>
  )
}
