'use client'

import { CalendarOff, ScanText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  HEARING_MODALITY_LABELS,
  checklistProgress,
  isHearingReady,
  type HearingWithContext,
} from '@/types/hearing.types'
import {
  BOARD_COLUMNS,
  boardColumn,
  formatHearingDateTime,
  hearingClientName,
  hearingCountdown,
  hearingKindLabel,
  hearingProcessLabel,
  type BoardColumn,
} from '../utils/display'

/** Tom do cabeçalho de cada coluna: o que pede ação é âmbar, o resolvido é
 * verde, o resto neutro. */
const COLUMN_TONE: Record<BoardColumn, string> = {
  sem_data: 'bg-warning',
  a_confirmar: 'bg-warning',
  em_preparacao: 'bg-info',
  pronta: 'bg-success',
  aguardando_resultado: 'bg-muted-foreground',
}

/** Mais cedo primeiro; sem data, a mais antiga primeiro — está há mais tempo
 * fora da pauta. */
function sortColumn(hearings: HearingWithContext[]): HearingWithContext[] {
  return [...hearings].sort((a, b) =>
    (a.event?.start_at ?? a.created_at).localeCompare(b.event?.start_at ?? b.created_at),
  )
}

interface HearingsBoardProps {
  hearings: HearingWithContext[]
  now: Date
  onOpen: (hearing: HearingWithContext) => void
}

/**
 * O Quadro de preparação. A coluna sai dos dados (`boardColumn`) e não há
 * arrastar: mover um cartão seria afirmar algo que os dados não dizem. O que
 * muda a coluna é agir na ficha — informar ou conferir a data, resolver o
 * checklist, marcar como pronta.
 */
export function HearingsBoard({ hearings, now, onOpen }: HearingsBoardProps) {
  const byColumn = new Map<BoardColumn, HearingWithContext[]>()
  for (const hearing of hearings) {
    const column = boardColumn(hearing, now)
    if (!column) continue
    byColumn.set(column, [...(byColumn.get(column) ?? []), hearing])
  }

  return (
    <div className="overflow-x-auto px-4 pt-4">
      <div className="grid min-w-[1080px] grid-cols-5 gap-3">
        {BOARD_COLUMNS.map((column) => {
          const cards = sortColumn(byColumn.get(column.id) ?? [])
          return (
            <section key={column.id} aria-label={column.label} className="flex min-w-0 flex-col rounded-lg bg-muted/40">
              <header className="px-3 pt-3 pb-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold">
                  <span aria-hidden className={cn('size-2 rounded-full', COLUMN_TONE[column.id])} />
                  {column.label}
                  <span className="ml-auto tabular-nums text-muted-foreground">{cards.length}</span>
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{column.hint}</p>
              </header>

              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {cards.length === 0 && (
                  <li className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Nada aqui
                  </li>
                )}
                {cards.map((hearing) => (
                  <BoardCard key={hearing.id} hearing={hearing} column={column.id} now={now} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function BoardCard({
  hearing,
  column,
  now,
  onOpen,
}: {
  hearing: HearingWithContext
  column: BoardColumn
  now: Date
  onOpen: (hearing: HearingWithContext) => void
}) {
  const event = hearing.event
  const process = hearingProcessLabel(hearing)
  const client = hearingClientName(hearing)
  const { resolved, total } = checklistProgress(hearing)
  const showProgress = !!hearing.checklist_generated_at && total > 0
  const ready = isHearingReady(hearing)
  const pct = total === 0 ? 0 : Math.round((resolved / total) * 100)

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(hearing)}
        className={cn(
          'w-full rounded-md border bg-card p-3 text-left shadow-xs transition-colors',
          'hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-tight">{hearingKindLabel(hearing)}</span>
          {hearing.modality && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {HEARING_MODALITY_LABELS[hearing.modality]}
            </span>
          )}
        </span>

        <span
          className={cn(
            'mt-1 block truncate text-[11px] text-muted-foreground',
            !client && process.isCnj && 'font-mono',
          )}
        >
          {client ?? process.label}
        </span>
        {client && (
          <span className={cn('block truncate text-[10.5px] text-muted-foreground', process.isCnj && 'font-mono')}>
            {process.label}
          </span>
        )}

        <span className="mt-2 flex items-center gap-1.5 text-[11px]">
          {event ? (
            <>
              <span className="font-medium tabular-nums">{formatHearingDateTime(event.start_at)}</span>
              <span
                className={cn(
                  'font-semibold',
                  column === 'aguardando_resultado' ? 'text-muted-foreground' : 'text-info',
                )}
              >
                {hearingCountdown(event.start_at, event.end_at, now)}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <CalendarOff aria-hidden className="h-3 w-3" />
              Sem data
            </span>
          )}
        </span>

        {column === 'a_confirmar' && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
            <ScanText aria-hidden className="h-2.5 w-2.5" />
            Conferir nos autos
          </span>
        )}

        {showProgress && column !== 'aguardando_resultado' && (
          <span className="mt-2 block">
            <span className="flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span>Checklist</span>
              <span className="tabular-nums">
                {resolved}/{total}
                {hearing.ready_override_at && resolved < total && ' · pronta por decisão'}
              </span>
            </span>
            <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full rounded-full', ready ? 'bg-success' : 'bg-info')}
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        )}
      </button>
    </li>
  )
}
