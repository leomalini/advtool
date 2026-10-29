'use client'

import Link from 'next/link'
import { CheckCircle2, ExternalLink, Link2, ListPlus, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/usePermissions'
import { calculatePrazo } from '@/lib/prazos'
import { cn } from '@/lib/utils'
import { officeToday } from '@/features/ia/tools/shared'
import {
  TRIAGE_URGENCY_LABELS,
  type PublicationWithRelations,
  type TriageUrgency,
} from '@/types/publication.types'
import {
  useCreateTriageTask,
  useDismissTriageSuggestion,
  useLinkProbableProcess,
} from '../hooks/useTriageActions'

const URGENCY_STYLES: Record<TriageUrgency, string> = {
  alta: 'bg-destructive/12 text-destructive',
  media: 'bg-warning/12 text-warning',
  baixa: 'bg-muted text-muted-foreground',
}

function formatDay(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/')
}

/**
 * A triagem por IA da publicação (fase 5): o que o ato é, a urgência, a
 * providência como sugestão de tarefa e, sem processo, o provável. A data do
 * prazo sai do motor de prazos, a partir dos dias que o texto dá — nunca da
 * IA. Nada é gravado sem clique.
 */
export function PublicationTriageCard({ publicacao }: { publicacao: PublicationWithRelations }) {
  const { can } = usePermissions()
  const triage = publicacao.triage
  const createTask = useCreateTriageTask(publicacao)
  const dismiss = useDismissTriageSuggestion(publicacao.id)
  const linkProcess = useLinkProbableProcess(publicacao.id)
  if (!triage) return null

  const deadline =
    triage.deadline_days && triage.deadline_counting
      ? calculatePrazo(
          publicacao.publication_date,
          triage.deadline_days,
          officeToday(),
          triage.deadline_counting,
          { ignoreRecess: triage.deadline_counting === 'corridos' },
        )
      : null
  const open = triage.suggestion_status === 'open'
  const probable = !publicacao.legal_process_id ? triage.probable_process : null

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Triagem por IA
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
            URGENCY_STYLES[triage.urgency],
          )}
        >
          {TRIAGE_URGENCY_LABELS[triage.urgency]}
        </span>
        <span className="text-xs font-medium">{triage.act_type}</span>
      </div>

      <p className="leading-relaxed">{triage.summary}</p>

      {deadline && (
        <p className="text-xs text-muted-foreground">
          Prazo no texto: {triage.deadline_days} dias{' '}
          {triage.deadline_counting === 'uteis' ? 'úteis' : 'corridos'} — vence em{' '}
          <span className="font-semibold text-foreground">{formatDay(deadline.end)}</span>
          {deadline.expired ? ' (já venceu)' : ''}. Calculado pelo motor de prazos; feriados locais
          não entram.
        </p>
      )}

      {probable && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Processo provável:</span>
          <Link
            href={`/processos/${probable.id}`}
            className="inline-flex items-center gap-1 font-mono text-foreground underline-offset-2 hover:underline"
          >
            {probable.cnj_number ?? 'sem número'}
            <ExternalLink className="h-3 w-3" />
          </Link>
          {triage.probable_reason && (
            <span className="text-muted-foreground">({triage.probable_reason})</span>
          )}
          {can('publicacoes', 'update') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={linkProcess.isPending}
              onClick={() => linkProcess.mutate(probable.id)}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" />
              Vincular
            </Button>
          )}
        </div>
      )}

      {triage.suggested_task && open && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Sugestão:</span>
          <span className="text-xs font-medium">{triage.suggested_task}</span>
          <div className="ml-auto flex gap-2">
            {can('tarefas', 'create') && (
              <Button
                size="sm"
                className="h-7"
                disabled={createTask.isPending}
                onClick={() => createTask.mutate(deadline?.end ?? null)}
              >
                {createTask.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListPlus className="mr-1 h-3.5 w-3.5" />
                )}
                Criar tarefa{deadline ? ` para ${formatDay(deadline.end)}` : ''}
              </Button>
            )}
            {can('publicacoes', 'update') && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate()}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}

      {triage.suggestion_status === 'task_created' && (
        <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          A sugestão virou tarefa.
          <Link href="/tarefas" className="underline-offset-2 hover:underline">
            Ver tarefas
          </Link>
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Leitura da IA para ajudar a triar — confira o texto antes de agir.
      </p>
    </div>
  )
}
