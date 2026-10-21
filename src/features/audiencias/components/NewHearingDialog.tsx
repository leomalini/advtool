'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toInstant } from '@/features/agenda/utils/datetime'
import { hearingScheduleSchema } from '@/schemas/hearing.schema'
import {
  HEARING_MODALITIES,
  HEARING_MODALITY_LABELS,
  type HearingModality,
} from '@/types/hearing.types'
import { useCreateHearing, useHearingKinds } from '../hooks/useHearings'
import { HearingCreatedWithoutDateError } from '../services/hearings.service'
import { suggestedEndTime } from '../utils/display'

interface NewHearingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  legalProcessId: string
}

/**
 * Nova audiência de um processo. Mais curto que o formulário de evento da
 * Agenda de propósito: o compromisso sai do processo (card, cliente e
 * responsável), e o que só audiência tem — tipo e modalidade — está aqui.
 * "Ainda sem data" cobre a audiência designada cuja data o escritório não
 * tem: ela entra na lista "Sem data" e na pendência.
 */
export function NewHearingDialog({ open, onOpenChange, legalProcessId }: NewHearingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        {/* Montado só aberto: cada abertura começa do zero, sem efeito para limpar. */}
        {open && <NewHearingForm legalProcessId={legalProcessId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NewHearingForm({ legalProcessId, onDone }: { legalProcessId: string; onDone: () => void }) {
  const { data: kinds = [] } = useHearingKinds()
  const createHearing = useCreateHearing()

  const [kindId, setKindId] = useState('')
  const [modality, setModality] = useState<HearingModality | null>(null)
  const [withoutDate, setWithoutDate] = useState(false)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const effectiveKindId = kindId || kinds[0]?.id || ''
  const duration = kinds.find((kind) => kind.id === effectiveKindId)?.default_duration_minutes ?? 60

  function handleStartChange(value: string) {
    setStartTime(value)
    if (value && (!endTime || endTime <= value)) setEndTime(suggestedEndTime(value, duration))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!effectiveKindId) {
      setError('Selecione o tipo da audiência.')
      return
    }

    let schedule: { startAt: string; endAt: string } | null = null
    if (!withoutDate) {
      const parsed = hearingScheduleSchema.safeParse({ date, start_time: startTime, end_time: endTime })
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Confira a data e o horário.')
        return
      }
      schedule = {
        startAt: toInstant(parsed.data.date, parsed.data.start_time),
        endAt: toInstant(parsed.data.date, parsed.data.end_time),
      }
    }

    setError(null)
    createHearing.mutate(
      { legalProcessId, kindId: effectiveKindId, modality, schedule },
      {
        onSuccess: onDone,
        // Criada sem a data também fecha: a ficha existe e está na lista.
        onError: (mutationError) => {
          if (mutationError instanceof HearingCreatedWithoutDateError) onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova audiência</DialogTitle>
        <DialogDescription>
          O compromisso entra na Agenda com o cliente e o responsável do processo.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        <Label className="text-xs">Tipo</Label>
        <Select value={effectiveKindId} onValueChange={setKindId}>
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue placeholder="Tipo da audiência" />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((kind) => (
              <SelectItem key={kind.id} value={kind.id}>
                {kind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Modalidade</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Modalidade">
          {HEARING_MODALITIES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={modality === option}
              onClick={() => setModality(modality === option ? null : option)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                modality === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {HEARING_MODALITY_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="new-hearing-without-date"
            checked={withoutDate}
            onCheckedChange={(checked) => setWithoutDate(checked === true)}
          />
          <Label htmlFor="new-hearing-without-date" className="text-xs font-normal">
            Ainda sem data
          </Label>
        </div>

        {!withoutDate && (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="new-hearing-date" className="text-xs">
                Data
              </Label>
              <Input
                id="new-hearing-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-9 text-sm [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-hearing-start" className="text-xs">
                Início
              </Label>
              <Input
                id="new-hearing-start"
                type="time"
                value={startTime}
                onChange={(event) => handleStartChange(event.target.value)}
                className="h-9 w-[104px] text-sm [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-hearing-end" className="text-xs">
                Término
              </Label>
              <Input
                id="new-hearing-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="h-9 w-[104px] text-sm [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={createHearing.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={createHearing.isPending}>
          {createHearing.isPending ? 'Salvando…' : 'Criar audiência'}
        </Button>
      </DialogFooter>
    </form>
  )
}
