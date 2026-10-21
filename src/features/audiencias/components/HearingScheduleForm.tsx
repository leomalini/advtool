'use client'

import { useState } from 'react'
import { addMinutes, format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toInstant } from '@/features/agenda/utils/datetime'
import { hearingScheduleSchema } from '@/schemas/hearing.schema'

interface HearingScheduleFormProps {
  /** O horário atual, quando a audiência já tem um. */
  current: { start_at: string; end_at: string } | null
  /** Duração padrão do tipo, para sugerir o término de quem informa a data. */
  defaultDurationMinutes: number
  submitLabel: string
  isPending: boolean
  onSubmit: (range: { startAt: string; endAt: string }) => void
  onCancel?: () => void
}

/** Término sugerido: início + duração do tipo, sem passar da meia-noite — o
 * formulário tem um campo de data só. */
function suggestedEnd(startTime: string, minutes: number): string {
  const [hours, mins] = startTime.split(':').map(Number)
  const start = new Date(2000, 0, 1, hours || 0, mins || 0)
  const end = addMinutes(start, minutes)
  return end.getDate() === start.getDate() ? format(end, 'HH:mm') : '23:59'
}

/**
 * Data e horário da audiência, no relógio do escritório. Grava pelo
 * `schedule_hearing`, que cria o compromisso na Agenda quando ainda não
 * existe — por isso não pede responsável nem tipo de evento: o banco resolve
 * pelo processo, como faz para o andamento.
 */
export function HearingScheduleForm({
  current,
  defaultDurationMinutes,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: HearingScheduleFormProps) {
  const [date, setDate] = useState(() => (current ? format(parseISO(current.start_at), 'yyyy-MM-dd') : ''))
  const [startTime, setStartTime] = useState(() =>
    current ? format(parseISO(current.start_at), 'HH:mm') : '',
  )
  const [endTime, setEndTime] = useState(() => {
    if (!current) return ''
    const end = format(parseISO(current.end_at), 'HH:mm')
    const start = format(parseISO(current.start_at), 'HH:mm')
    // Compromisso antigo sem duração: sugere a do tipo em vez de repetir o início.
    return end === start ? suggestedEnd(start, defaultDurationMinutes) : end
  })
  const [error, setError] = useState<string | null>(null)

  function handleStartChange(value: string) {
    setStartTime(value)
    // Enquanto o término não foi mexido à mão, acompanha o início.
    if (value && (!endTime || endTime <= value)) {
      setEndTime(suggestedEnd(value, defaultDurationMinutes))
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = hearingScheduleSchema.safeParse({ date, start_time: startTime, end_time: endTime })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira a data e o horário.')
      return
    }
    setError(null)
    onSubmit({
      startAt: toInstant(parsed.data.date, parsed.data.start_time),
      endAt: toInstant(parsed.data.date, parsed.data.end_time),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <div className="space-y-1">
          <Label htmlFor="hearing-date" className="text-xs">
            Data
          </Label>
          <Input
            id="hearing-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hearing-start" className="text-xs">
            Início
          </Label>
          <Input
            id="hearing-start"
            type="time"
            value={startTime}
            onChange={(event) => handleStartChange(event.target.value)}
            className="h-9 w-[104px] text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hearing-end" className="text-xs">
            Término
          </Label>
          <Input
            id="hearing-end"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="h-9 w-[104px] text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
