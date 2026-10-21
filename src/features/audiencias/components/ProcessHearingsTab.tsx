'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarOff, History, Landmark, MapPin, Plus, ScanText, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import {
  HEARING_MODALITY_LABELS,
  HEARING_STATUS_LABELS,
  hearingJoinUrl,
  isHearingDateUnconfirmed,
  isOpenHearing,
  type HearingDetail,
} from '@/types/hearing.types'
import { useHearingsForProcess } from '../hooks/useHearings'
import {
  formatActDay,
  formatHearingDateTime,
  hearingCountdown,
  hearingKindLabel,
  hearingMovementText,
  hearingNeedsAttention,
  hearingTimeRange,
} from '../utils/display'
import { ChecklistProgressPill } from './ChecklistProgressPill'
import { HearingDetailModal } from './HearingDetailModal'
import { NewHearingDialog } from './NewHearingDialog'

/**
 * Ordem da aba: o que está sem data primeiro (é o que pede providência), depois
 * as próximas, da mais perto para a mais longe, e por fim o que já passou ou
 * foi encerrado, da mais recente para a mais antiga.
 */
function sortForProcess(hearings: HearingDetail[], now: Date): HearingDetail[] {
  const rank = (hearing: HearingDetail): number => {
    if (hearing.status === 'a_designar') return 0
    if (isOpenHearing(hearing.status) && hearing.event && parseISO(hearing.event.end_at) >= now) return 1
    return 2
  }
  return [...hearings].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    const aStart = a.event?.start_at ?? a.created_at
    const bStart = b.event?.start_at ?? b.created_at
    return rank(a) === 2 ? bStart.localeCompare(aStart) : aStart.localeCompare(bStart)
  })
}

const STATUS_CHIP: Record<HearingDetail['status'], string> = {
  a_designar: 'bg-warning/12 text-warning',
  designada: 'bg-info/12 text-info',
  realizada: 'bg-success/12 text-success',
  nao_realizada: 'bg-muted text-muted-foreground',
  cancelada: 'bg-muted text-muted-foreground',
}

interface ProcessHearingsTabProps {
  legalProcessId: string
}

/** A aba Audiências do processo: todas, em qualquer status, com as
 * remarcações à vista. A ficha abre aqui mesmo, sem sair do processo. */
export function ProcessHearingsTab({ legalProcessId }: ProcessHearingsTabProps) {
  const { data: hearings = [], isLoading, isError } = useHearingsForProcess(legalProcessId)
  const { can } = usePermissions()
  const now = useNow()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => sortForProcess(hearings, now), [hearings, now])
  const canCreate = can('agenda', 'create') && can('agenda', 'update')

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <Landmark className="h-8 w-8" />
        <p className="text-sm font-medium">Não foi possível carregar as audiências</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Audiências</h3>
          {rows.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {rows.length}
            </span>
          )}
        </div>
        {canCreate && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nova audiência
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Landmark className="h-7 w-7" />
          <p className="text-sm">Nenhuma audiência neste processo</p>
          <p className="max-w-sm text-center text-xs">
            Entram sozinhas quando o andamento designa uma, ou pelo botão Nova audiência.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((hearing) => (
            <ProcessHearingRow
              key={hearing.id}
              hearing={hearing}
              now={now}
              onOpen={() => setOpenId(hearing.id)}
            />
          ))}
        </ul>
      )}

      <HearingDetailModal hearingId={openId} onClose={() => setOpenId(null)} showProcessLink={false} />
      <NewHearingDialog open={creating} onOpenChange={setCreating} legalProcessId={legalProcessId} />
    </div>
  )
}

function ProcessHearingRow({
  hearing,
  now,
  onOpen,
}: {
  hearing: HearingDetail
  now: Date
  onOpen: () => void
}) {
  const event = hearing.event
  const start = event ? parseISO(event.start_at) : null
  const closedOrPast = !isOpenHearing(hearing.status) || (event ? parseISO(event.end_at) < now : false)
  const unconfirmed = isHearingDateUnconfirmed(hearing)
  const attention = hearingNeedsAttention(hearing, now)
  const reschedules = hearing.date_changes.filter((change) => change.from_start_at !== null)
  const lastReschedule = reschedules.at(-1)
  const act = hearing.status === 'a_designar' ? hearingMovementText(hearing) : null
  const joinUrl = event && parseISO(event.end_at) >= now ? hearingJoinUrl(hearing) : null

  return (
    <li
      className={cn(
        'flex items-stretch rounded-lg border transition-colors hover:bg-muted/40',
        attention && 'border-warning/40',
        closedOrPast && 'opacity-70',
      )}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
        <span
          className={cn(
            'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg',
            start ? 'bg-muted' : 'bg-warning/12 text-warning',
          )}
        >
          {start ? (
            <>
              <span className="text-base leading-none font-bold tabular-nums">{format(start, 'dd')}</span>
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                {format(start, 'MMM', { locale: ptBR })}
              </span>
            </>
          ) : (
            <CalendarOff aria-hidden className="size-4" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{hearingKindLabel(hearing)}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_CHIP[hearing.status])}>
              {HEARING_STATUS_LABELS[hearing.status]}
            </span>
            {unconfirmed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
                <ScanText aria-hidden className="h-2.5 w-2.5" />
                Data a confirmar
              </span>
            )}
            {hearing.modality && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {HEARING_MODALITY_LABELS[hearing.modality]}
              </span>
            )}
            <ChecklistProgressPill hearing={hearing} />
          </span>

          {event ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {format(parseISO(event.start_at), "EEEE, dd/MM/yyyy", { locale: ptBR })} ·{' '}
              {hearingTimeRange(event.start_at, event.end_at, event.all_day)}
              {isOpenHearing(hearing.status) && (
                <> · {hearingCountdown(event.start_at, event.end_at, now)}</>
              )}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-warning">Sem data — informe na ficha</span>
          )}

          {act && hearing.movement && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              Andamento de {formatActDay(hearing.movement.movement_date)}: “{act}”
            </span>
          )}

          {lastReschedule && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <History aria-hidden className="h-3 w-3 shrink-0" />
              Remarcada {reschedules.length === 1 ? 'uma vez' : `${reschedules.length} vezes`} · antes{' '}
              {formatHearingDateTime(lastReschedule.from_start_at!)}
            </span>
          )}

          {event?.location && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin aria-hidden className="h-3 w-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </span>
      </button>

      {joinUrl && (
        <div className="flex shrink-0 items-center pr-3">
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
