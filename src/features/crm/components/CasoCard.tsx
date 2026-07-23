'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import type { AreaJuridica, EtiquetaId } from '@/data/mock'
import type { CaseWithRelations } from '@/types/case.types'
import { getCaseClientName } from '@/types/case.types'
import { formatPrazo, formatRelativeDate } from '../utils/prazo'

interface CasoCardProps {
  caso: CaseWithRelations
  onClick: () => void
  dragHandleProps?: Record<string, unknown>
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function CasoCard({ caso, onClick, dragHandleProps }: CasoCardProps) {
  const legalArea = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
  const tags = caso.tags as EtiquetaId[]
  const hasAlert = tags.includes('urgente') || tags.includes('prazo-fatal')
  const prazoInfo = caso.next_deadline ? formatPrazo(caso.next_deadline) : null
  const assignedName = caso.assigned_profile?.full_name ?? ''
  const advInitials = assignedName ? getInitials(assignedName) : '??'
  const clientName = getCaseClientName(caso)

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-card rounded-[11px] border border-border pl-4 pr-3.5 py-3 cursor-pointer',
        'hover:border-foreground/20 hover:-translate-y-px hover:shadow-lg transition-all duration-200',
        'select-none'
      )}
      {...dragHandleProps}
    >
      {legalArea && (
        <span
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
          style={{ backgroundColor: legalArea.accent }}
        />
      )}

      {/* Header: cliente + alerta */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
            {clientName}
          </p>
          {caso.cnj_number && (
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
              {caso.cnj_number}
            </p>
          )}
        </div>
        {hasAlert && (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Área jurídica */}
      {legalArea && (
        <div className="mb-2.5">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
              legalArea.bg,
              legalArea.color
            )}
          >
            {legalArea.label}
          </span>
        </div>
      )}

      {/* Próxima tarefa */}
      {caso.next_task_summary && (
        <p className="text-[11px] text-muted-foreground truncate mb-2.5">
          {caso.next_task_summary}
        </p>
      )}

      {/* Etiquetas */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {tags.slice(0, 3).map((etId) => {
            const et = ETIQUETAS[etId]
            if (!et) return null
            return (
              <span
                key={etId}
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold',
                  et.color,
                  et.textColor
                )}
              >
                {et.label}
              </span>
            )
          })}
          {tags.length > 3 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-muted text-muted-foreground">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: prazo + advogado + atualização */}
      <div className="flex items-center justify-between gap-2 mt-1 pt-2.5 border-t border-border">
        <div className="flex items-center gap-2 min-w-0">
          {prazoInfo && (
            <span
              className={cn(
                'flex items-center gap-1 text-[11px]',
                prazoInfo.tone === 'critical' && 'text-destructive font-semibold animate-pulse-urgent',
                prazoInfo.tone === 'warning' && 'text-warning font-medium',
                prazoInfo.tone === 'neutral' && 'text-muted-foreground'
              )}
            >
              <Clock className="w-3 h-3 flex-shrink-0" />
              {prazoInfo.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeDate(caso.updated_at)}
          </span>
          {assignedName && (
            <div
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9.5px] font-bold flex-shrink-0 bg-accent text-accent-foreground"
              title={assignedName}
            >
              {advInitials}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
