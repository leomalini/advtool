'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { hearingDetailsSchema, type HearingDetailsInput } from '@/schemas/hearing.schema'
import {
  HEARING_MODALITIES,
  HEARING_MODALITY_LABELS,
  type HearingKind,
  type HearingModality,
} from '@/types/hearing.types'

interface HearingDetailsFormProps {
  initial: HearingDetailsInput
  kinds: HearingKind[]
  canUpdate: boolean
  isPending: boolean
  onSubmit: (input: HearingDetailsInput) => void
}

/**
 * Tipo, modalidade e link da sala. O pai monta com `key` da ficha + versão:
 * assim o estado nasce dos dados salvos, sem efeito para sincronizar.
 */
export function HearingDetailsForm({
  initial,
  kinds,
  canUpdate,
  isPending,
  onSubmit,
}: HearingDetailsFormProps) {
  const [kindId, setKindId] = useState(initial.kind_id)
  const [modality, setModality] = useState<HearingModality | null>(initial.modality)
  const [meetingUrl, setMeetingUrl] = useState(initial.meeting_url)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    kindId !== initial.kind_id ||
    modality !== initial.modality ||
    meetingUrl.trim() !== initial.meeting_url.trim()

  // O link só faz sentido quando há sala virtual — mas não se apaga sozinho ao
  // trocar para presencial: a troca pode ser engano, e o link continua salvo.
  const showUrl = modality !== 'presencial'

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = hearingDetailsSchema.safeParse({
      kind_id: kindId,
      modality,
      meeting_url: meetingUrl,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    setError(null)
    onSubmit(parsed.data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div className="space-y-1">
        <Label className="text-xs">Tipo</Label>
        <Select value={kindId} onValueChange={setKindId} disabled={!canUpdate}>
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

      <fieldset className="space-y-1" disabled={!canUpdate}>
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
                'disabled:pointer-events-none disabled:opacity-50',
                modality === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {HEARING_MODALITY_LABELS[option]}
            </button>
          ))}
        </div>
        {!modality && (
          <p className="text-[11px] text-muted-foreground">Ainda não informada.</p>
        )}
      </fieldset>

      {showUrl && (
        <div className="space-y-1">
          <Label htmlFor="hearing-meeting-url" className="text-xs">
            Link da sala
          </Label>
          <Input
            id="hearing-meeting-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            disabled={!canUpdate}
            className="h-9 text-sm"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {canUpdate && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" disabled={!dirty || isPending}>
            {isPending ? 'Salvando…' : 'Salvar detalhes'}
          </Button>
        </div>
      )}
    </form>
  )
}
