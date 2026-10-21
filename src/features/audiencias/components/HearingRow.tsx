'use client'

import { Ban, MapPin, ScanText, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getInitials } from '@/utils/profile'
import { ChecklistProgressPill } from './ChecklistProgressPill'
import {
  HEARING_MODALITY_LABELS,
  hearingJoinUrl,
  isHearingDateUnconfirmed,
  type HearingWithContext,
} from '@/types/hearing.types'
import {
  hearingClientName,
  hearingCountdown,
  hearingKindLabel,
  hearingPlace,
  hearingProcessLabel,
  hearingTimeRange,
} from '../utils/display'

/** Coluna do horário: largura fixa para as linhas lerem como uma tabela. */
const TIME_COL = 'w-[92px]'

interface HearingRowProps {
  hearing: HearingWithContext
  now: Date
  onOpen: (hearing: HearingWithContext) => void
}

/**
 * Uma audiência da pauta. A linha inteira abre a ficha; o "Entrar na sala"
 * fica de fora do botão principal porque é um link para outro lugar, e botão
 * dentro de botão não é HTML válido.
 */
export function HearingRow({ hearing, now, onOpen }: HearingRowProps) {
  const event = hearing.event
  if (!event) return null

  const cancelled = hearing.status === 'cancelada'
  const unconfirmed = isHearingDateUnconfirmed(hearing)
  const process = hearingProcessLabel(hearing)
  const client = hearingClientName(hearing)
  const place = hearingPlace(hearing)
  const ended = new Date(event.end_at) < now
  const joinUrl = ended ? null : hearingJoinUrl(hearing)

  return (
    <li className={cn('flex items-stretch bg-card', cancelled && 'opacity-60')}>
      <button
        type="button"
        onClick={() => onOpen(hearing)}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        )}
      >
        <span className={cn(TIME_COL, 'shrink-0 pt-px')}>
          <span
            className={cn(
              'block text-sm font-semibold tabular-nums',
              cancelled && 'line-through',
            )}
          >
            {hearingTimeRange(event.start_at, event.end_at, event.all_day)}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-[11px] font-medium',
              ended ? 'text-muted-foreground' : 'text-info',
            )}
          >
            {cancelled ? 'Cancelada' : hearingCountdown(event.start_at, event.end_at, now)}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{hearingKindLabel(hearing)}</span>

            {hearing.modality && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {HEARING_MODALITY_LABELS[hearing.modality]}
              </span>
            )}

            {unconfirmed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <ScanText aria-hidden className="h-2.5 w-2.5" />
                Data a confirmar
              </span>
            )}

            <ChecklistProgressPill hearing={hearing} />

            {cancelled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Ban aria-hidden className="h-2.5 w-2.5" />
                Fora da Agenda
              </span>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className={cn('truncate', process.isCnj && 'font-mono')}>{process.label}</span>
            {client && <span className="truncate">· {client}</span>}
          </span>

          {place && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin aria-hidden className="h-3 w-3 shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          )}
        </span>

        {event.assignees.length > 0 && (
          <span className="hidden shrink-0 -space-x-1.5 pt-0.5 sm:flex" aria-label="Responsáveis">
            {event.assignees.slice(0, 3).map((profile) => (
              <span
                key={profile.id}
                title={profile.full_name}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-semibold text-muted-foreground"
              >
                {getInitials(profile.full_name)}
              </span>
            ))}
          </span>
        )}
      </button>

      {joinUrl && (
        <div className="flex shrink-0 items-center pr-4">
          <Button asChild size="xs" variant="outline">
            <a href={joinUrl} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden />
              Entrar na sala
            </a>
          </Button>
        </div>
      )}
    </li>
  )
}
