'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarCheck, CalendarOff, Landmark, ScanText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { localDayKey } from '@/features/agenda/utils/datetime'
import { useHearingAgenda, useHearingsWithoutDate } from '@/features/audiencias/hooks/useHearings'
import {
  hearingClientName,
  hearingCountdown,
  hearingKindLabel,
  hearingProcessLabel,
  windowEnd,
} from '@/features/audiencias/utils/display'
import { HEARING_MODALITY_LABELS, isHearingDateUnconfirmed } from '@/types/hearing.types'
import { CardLink } from './CardLink'
import { DashboardCard } from './DashboardCard'
import { EmptyLine } from './EmptyLine'

/** Duas semanas: o bastante para preparar a audiência, curto o bastante para
 * a lista caber no card. A pauta completa está a um clique. */
const WINDOW_DAYS = 14
const MAX_ROWS = 5
/** O dashboard fica aberto o dia todo; o andamento pode designar ou mover uma
 * audiência a qualquer hora. */
const REFETCH_MS = 5 * 60_000

const PILL = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold'

interface UpcomingHearingsCardProps {
  className?: string
}

/**
 * As próximas audiências e, em cima, o que pede atenção antes delas: as sem
 * data e as com a data ainda não conferida. Cada linha abre a ficha.
 */
export function UpcomingHearingsCard({ className }: UpcomingHearingsCardProps) {
  const now = useNow()
  // Chave por dia, não por instante: senão o cache viraria a cada minuto.
  const todayKey = localDayKey(now.toISOString())
  const { from, to } = useMemo(() => {
    const start = new Date(`${todayKey}T00:00:00`)
    return { from: start.toISOString(), to: windowEnd(start, WINDOW_DAYS).toISOString() }
  }, [todayKey])

  const agenda = useHearingAgenda(from, to, false, { refetchInterval: REFETCH_MS })
  const withoutDate = useHearingsWithoutDate()

  // A de hoje que já terminou sai: o card é do que vem pela frente.
  const ahead = (agenda.data ?? []).filter((hearing) => hearing.event && parseISO(hearing.event.end_at) >= now)
  const unconfirmed = ahead.filter(isHearingDateUnconfirmed).length
  const withoutDateCount = withoutDate.data?.length ?? 0
  const rows = ahead.slice(0, MAX_ROWS)
  const hidden = ahead.length - rows.length

  return (
    <DashboardCard
      icon={Landmark}
      tone="violet"
      title="Próximas audiências"
      subtitle={`${WINDOW_DAYS} dias`}
      action={<CardLink href="/audiencias">Ver pauta</CardLink>}
      footer={
        hidden > 0 ? (
          <>
            <span>
              Mais {hidden} {hidden === 1 ? 'audiência' : 'audiências'} no período
            </span>
            <CardLink href="/audiencias" strong>
              Abrir pauta
            </CardLink>
          </>
        ) : undefined
      }
      className={className}
    >
      {(withoutDateCount > 0 || unconfirmed > 0) && (
        <div className="mb-1 flex flex-wrap gap-1.5 px-2">
          {withoutDateCount > 0 && (
            <Link href="/audiencias" className={cn(PILL, 'bg-warning/12 text-warning hover:bg-warning/20')}>
              <CalendarOff aria-hidden className="size-3" />
              {withoutDateCount} sem data
            </Link>
          )}
          {unconfirmed > 0 && (
            <Link href="/audiencias" className={cn(PILL, 'bg-warning/12 text-warning hover:bg-warning/20')}>
              <ScanText aria-hidden className="size-3" />
              {unconfirmed} a confirmar
            </Link>
          )}
        </div>
      )}

      {agenda.isLoading && (
        <div className="space-y-2 px-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {agenda.isError && (
        <EmptyLine icon={Landmark} tone="muted" title="Não foi possível carregar as audiências" />
      )}

      {agenda.isSuccess && rows.length === 0 && (
        <EmptyLine
          icon={CalendarCheck}
          tone="success"
          title={`Nenhuma audiência nos próximos ${WINDOW_DAYS} dias`}
          description="As designadas no andamento entram sozinhas."
        />
      )}

      {rows.length > 0 && (
        <ul>
          {rows.map((hearing) => {
            const event = hearing.event!
            const start = parseISO(event.start_at)
            const isToday = localDayKey(event.start_at) === todayKey
            const client = hearingClientName(hearing)
            const process = hearingProcessLabel(hearing)

            return (
              <li key={hearing.id}>
                <Link
                  href={`/audiencias?ficha=${hearing.id}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex size-11 shrink-0 flex-col items-center justify-center rounded-lg',
                      isToday ? 'bg-chart-2/12 text-chart-2' : 'bg-muted',
                    )}
                  >
                    <span className="text-base leading-none font-bold tabular-nums">
                      {format(start, 'dd')}
                    </span>
                    <span className={cn('text-[11px] font-semibold uppercase', !isToday && 'text-muted-foreground')}>
                      {format(start, 'MMM', { locale: ptBR })}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold">{hearingKindLabel(hearing)}</span>
                      {hearing.modality && (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {HEARING_MODALITY_LABELS[hearing.modality]}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {client ?? process.label}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold tabular-nums">{format(start, 'HH:mm')}</span>
                      <span className="font-semibold text-chart-2">
                        {hearingCountdown(event.start_at, event.end_at, now)}
                      </span>
                      {isHearingDateUnconfirmed(hearing) && (
                        <span className={cn(PILL, 'bg-warning/12 text-warning')}>
                          <ScanText aria-hidden className="size-3" />a confirmar
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardCard>
  )
}
