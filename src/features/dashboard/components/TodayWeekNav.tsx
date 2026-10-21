'use client'

import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { ptBR } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { rangeLabel } from '../utils/today'

interface TodayWeekNavProps {
  firstDay: Date
  lastDay: Date
  /** The strip starts today: "Hoje" has nowhere to go back to. */
  startsToday: boolean
  onShift: (days: number) => void
  onPick: (firstDay: Date) => void
  onReset: () => void
}

/** Moves the strip: a day at a time, to a date picked in the calendar, or
 * back to today. */
export function TodayWeekNav({
  firstDay,
  lastDay,
  startsToday,
  onShift,
  onPick,
  onReset,
}: TodayWeekNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Escolher a data inicial — mostrando ${rangeLabel(firstDay, lastDay)}`}
            className="mr-auto -ml-2 font-semibold tabular-nums"
          >
            <CalendarDays aria-hidden className="text-muted-foreground" />
            {rangeLabel(firstDay, lastDay)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            required
            locale={ptBR}
            selected={firstDay}
            defaultMonth={firstDay}
            onSelect={(day) => {
              onPick(day)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {!startsToday && (
        <Button variant="outline" size="sm" onClick={onReset}>
          Hoje
        </Button>
      )}
      <Button variant="outline" size="icon-sm" aria-label="Dia anterior" onClick={() => onShift(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Próximo dia" onClick={() => onShift(1)}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}
