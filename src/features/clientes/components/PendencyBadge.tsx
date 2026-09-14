'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { ClientIssue, ClientPendency } from '@/types/cliente.types'

export function faltamLabel(count: number): string {
  return `${count} campo${count !== 1 ? 's' : ''} em falta`
}

/** Os campos em falta, do mais grave para o menos.
 *
 * Um componente só para a aba de Pendências e para o aviso do cabeçalho: se as
 * duas listas divergissem, não haveria como saber qual está certa. */
export function IssueList({ issues }: { issues: ClientIssue[] }) {
  const sorted = [...issues].sort(
    (a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')
  )

  return (
    <ul className="space-y-0.5">
      {sorted.map((issue) => (
        <li
          key={issue.kind}
          className={cn(
            'text-xs',
            // O que trava o trabalho fica em vermelho aqui também, para
            // concordar com a tela de pendências.
            issue.severity === 'high' ? 'font-medium text-destructive' : 'text-muted-foreground'
          )}
        >
          · {issue.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Aviso de cadastro incompleto ao lado do nome do cliente.
 *
 * O hover mostra o que falta sem tirar quem está lendo da aba em que está —
 * na maioria das vezes a pergunta é só "falta alguma coisa?", e a resposta não
 * justifica trocar de aba. O clique leva à aba de Pendências para quem quiser
 * resolver.
 */
export function PendencyHeaderBadge({
  pendency,
  onOpen,
}: {
  pendency: ClientPendency
  onOpen: () => void
}) {
  const label = faltamLabel(pendency.issues.length)

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={label}
          className="shrink-0 rounded p-0.5 text-warning transition-colors hover:bg-warning/12"
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-auto max-w-xs">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <div className="mt-1.5">
          <IssueList issues={pendency.issues} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Clique para abrir a aba Pendências.</p>
      </HoverCardContent>
    </HoverCard>
  )
}
