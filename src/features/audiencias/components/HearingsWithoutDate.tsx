'use client'

import { CalendarOff, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HearingWithContext } from '@/types/hearing.types'
import {
  formatActDay,
  hearingClientName,
  hearingKindLabel,
  hearingMovementText,
  hearingProcessLabel,
} from '../utils/display'

interface HearingsWithoutDateProps {
  hearings: HearingWithContext[]
  onOpen: (hearing: HearingWithContext) => void
  canSchedule: boolean
}

/**
 * Audiências designadas no andamento sem data no texto. Ficam no topo da
 * pauta enquanto houver: audiência marcada fora da agenda é o que ninguém pode
 * descobrir no dia.
 */
export function HearingsWithoutDate({ hearings, onOpen, canSchedule }: HearingsWithoutDateProps) {
  if (hearings.length === 0) return null

  return (
    <section
      aria-labelledby="hearings-without-date"
      className="mx-4 mt-4 overflow-hidden rounded-lg border border-warning/30 bg-warning/[0.04]"
    >
      <header className="flex items-center gap-2 border-b border-warning/20 px-4 py-2.5">
        <CalendarOff aria-hidden className="h-4 w-4 text-warning" />
        <h2 id="hearings-without-date" className="text-sm font-semibold">
          Sem data
        </h2>
        <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
          {hearings.length}
        </span>
        <p className="ml-1 hidden text-xs text-muted-foreground md:block">
          Designadas no andamento, mas o texto não trouxe data e hora. Confira nos autos.
        </p>
      </header>

      <ul className="divide-y divide-warning/15">
        {hearings.map((hearing) => {
          const process = hearingProcessLabel(hearing)
          const client = hearingClientName(hearing)
          const act = hearingMovementText(hearing)

          return (
            <li key={hearing.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{hearingKindLabel(hearing)}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span className={cn(process.isCnj && 'font-mono')}>{process.label}</span>
                  {client && <span>· {client}</span>}
                </p>
                {act && hearing.movement && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Andamento de {formatActDay(hearing.movement.movement_date)}: “{act}”
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant={canSchedule ? 'default' : 'outline'}
                className="h-7 shrink-0 text-xs"
                onClick={() => onOpen(hearing)}
              >
                {canSchedule && <CalendarPlus className="mr-1 h-3 w-3" />}
                {canSchedule ? 'Informar data' : 'Ver'}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
