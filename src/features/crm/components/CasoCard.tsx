'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import type { Caso } from '@/data/mock'

interface CasoCardProps {
  caso: Caso
  onClick: () => void
  dragHandleProps?: Record<string, unknown>
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `há ${diffDays} dias`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return 'há 1 mês'
  return `há ${diffMonths} meses`
}

function formatPrazo(prazoStr: string): { label: string; isUrgent: boolean } {
  const prazo = new Date(prazoStr)
  const now = new Date()
  const diffMs = prazo.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: `Vencido há ${Math.abs(diffDays)}d`, isUrgent: true }
  if (diffDays === 0) return { label: 'Vence hoje', isUrgent: true }
  if (diffDays <= 3) return { label: `${diffDays}d restantes`, isUrgent: true }
  if (diffDays <= 7) return { label: `${diffDays}d restantes`, isUrgent: false }

  const date = prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return { label: date, isUrgent: false }
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

const ADV_COLORS: Record<string, string> = {
  'adv-1': 'bg-violet-500',
  'adv-2': 'bg-cyan-500',
}

export function CasoCard({ caso, onClick, dragHandleProps }: CasoCardProps) {
  const area = AREAS_JURIDICAS[caso.areaJuridica]
  const hasAlert = caso.etiquetas.includes('urgente') || caso.etiquetas.includes('prazo-fatal')
  const prazoInfo = caso.proximoPrazo ? formatPrazo(caso.proximoPrazo) : null
  const advInitials = getInitials(caso.advogadoNome)
  const advColor = ADV_COLORS[caso.advogadoId] ?? 'bg-zinc-500'

  return (
    <div
      onClick={onClick}
      className={cn(
        'group bg-white rounded-xl border border-zinc-200 p-3.5 cursor-pointer',
        'hover:shadow-md hover:border-zinc-300 transition-all duration-200',
        'select-none'
      )}
      {...dragHandleProps}
    >
      {/* Header: cliente + alerta */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
          {caso.clienteNome}
        </p>
        {hasAlert && (
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Área jurídica */}
      <div className="mb-2.5">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
            area.bg,
            area.color
          )}
        >
          {area.label}
        </span>
      </div>

      {/* Próxima tarefa */}
      {caso.proximaTarefa && (
        <p className="text-xs text-zinc-500 truncate mb-2.5">
          {caso.proximaTarefa}
        </p>
      )}

      {/* Etiquetas */}
      {caso.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {caso.etiquetas.slice(0, 3).map((etId) => {
            const et = ETIQUETAS[etId]
            if (!et) return null
            return (
              <span
                key={etId}
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                  et.color,
                  et.textColor
                )}
              >
                {et.label}
              </span>
            )
          })}
          {caso.etiquetas.length > 3 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-500">
              +{caso.etiquetas.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: prazo + advogado + atualização */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-2 min-w-0">
          {prazoInfo && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs',
                prazoInfo.isUrgent ? 'text-red-500 font-medium' : 'text-zinc-400'
              )}
            >
              <Clock className="w-3 h-3 flex-shrink-0" />
              {prazoInfo.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-zinc-400">
            {formatRelativeDate(caso.ultimaAtualizacao)}
          </span>
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0',
              advColor
            )}
            title={caso.advogadoNome}
          >
            {advInitials}
          </div>
        </div>
      </div>
    </div>
  )
}
