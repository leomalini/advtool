'use client'

import { Activity, ArrowRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkflows, useAllColumns } from '../hooks/useWorkflows'
import { useCrmItemColumnHistory } from '../hooks/useCrmItems'

const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatTimeOnly(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

interface CrmItemTimelineProps {
  crmItemId: string
  /** Shown in the empty-state hint, e.g. "caso" or "processo". */
  itemLabel?: string
}

/** Column-history timeline — shared between the CRM case modal and the Processo modal so both stay identical. */
export function CrmItemTimeline({ crmItemId, itemLabel = 'item' }: CrmItemTimelineProps) {
  const { data: history = [], isLoading, isError } = useCrmItemColumnHistory(crmItemId)
  const { data: workflows = [] } = useWorkflows()
  const allColumns = useAllColumns()

  function findColumn(id: string | null) {
    if (!id) return null
    return allColumns.find((c) => c.id === id) ?? null
  }

  function findWorkflowByColumn(columnId: string | null) {
    if (!columnId) return null
    const col = allColumns.find((c) => c.id === columnId)
    if (!col) return null
    return workflows.find((w) => w.id === col.workflow_id) ?? null
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center pt-1.5">
              <div className="w-3 h-3 rounded-full bg-muted" />
              {i < 2 && <div className="w-px h-12 bg-muted mt-1" />}
            </div>
            <div className="flex-1 pb-6">
              <div className="h-4 w-48 bg-muted rounded mb-2" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Activity className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Nenhuma movimentação registrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            O histórico de etapas aparecerá aqui conforme o {itemLabel} avança
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-sm font-semibold text-foreground/80">Histórico de etapas</h3>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
          {history.length}
        </span>
      </div>

      <div className="relative">
        {history.map((entry, index) => {
          const isLast = index === history.length - 1
          const isCreation = entry.from_column_id === null || entry.from_column_id === entry.to_column_id
          const fromCol = findColumn(entry.from_column_id)
          const toCol = findColumn(entry.to_column_id)
          const fromWf = findWorkflowByColumn(entry.from_column_id)
          const toWf = findWorkflowByColumn(entry.to_column_id)
          const workflowChanged = !isCreation && !!fromWf && !!toWf && fromWf.id !== toWf.id
          const userName = entry.moved_by_profile?.full_name ?? 'Sistema'
          const initials = userName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
          const dotColor = toCol?.cor ?? '#94a3b8'

          return (
            <div key={entry.id} className="flex gap-4">
              {/* Dot + vertical line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-3 h-3 rounded-full mt-1.5 ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: dotColor }}
                />
                {!isLast && <div className="w-px flex-1 bg-muted mt-1 min-h-[2rem]" />}
              </div>

              {/* Content */}
              <div className={cn('flex-1', isLast ? 'pb-0' : 'pb-6')}>
                <div className="flex items-start justify-between gap-4">
                  {/* Left: event info */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {isCreation
                        ? 'Criado'
                        : workflowChanged
                          ? 'Workflow alterado'
                          : 'Etapa atualizada'}
                    </p>

                    {isCreation ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          Adicionado em{' '}
                          <span
                            className="font-semibold"
                            style={{ color: toCol?.cor ?? '#71717a' }}
                          >
                            {toCol?.nome ?? '—'}
                          </span>
                        </span>
                      </div>
                    ) : workflowChanged ? (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">
                          {fromWf?.nome ?? '—'} · {fromCol?.nome ?? '—'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: toCol?.cor ?? '#71717a' }}
                        >
                          {toWf?.nome ?? '—'} · {toCol?.nome ?? '—'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-medium">
                          {fromCol?.nome ?? '—'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: toCol?.cor ?? '#71717a' }}
                        >
                          {toCol?.nome ?? '—'}
                        </span>
                      </div>
                    )}

                    {/* Workflow context — mostra a qual workflow esta etapa pertence */}
                    {!workflowChanged && toWf && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: toWf.cor }}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {toWf.nome}
                        </span>
                      </div>
                    )}

                    {/* User */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0',
                          avatarColor(userName)
                        )}
                      >
                        {initials}
                      </div>
                      <span className="text-xs text-muted-foreground">{userName}</span>
                    </div>
                  </div>

                  {/* Right: date + time */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatDateShort(entry.moved_at)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimeOnly(entry.moved_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
