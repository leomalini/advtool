'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  expandOccurrences,
  MAX_OCCURRENCES,
  RECURRENCE_LABELS,
  RECURRENCE_TYPES,
  type RecurrenceType,
} from '@/lib/recurrence'
import {
  recurrenceIssue,
  toRecurrenceRule,
  type RecurrenceFormValues,
} from '@/schemas/recurrence.schema'
import { NONE_VALUE } from '@/utils/select'

interface RecurrenceFieldsProps {
  value: RecurrenceFormValues
  onChange: (patch: Partial<RecurrenceFormValues>) => void
  /** Primeira ocorrência (yyyy-MM-dd) — de onde a série parte. */
  startDate?: string | null
  /** "eventos", "tarefas" — para a prévia ler naturalmente. */
  pluralNoun: string
  errors?: Partial<Record<keyof RecurrenceFormValues, string>>
}

/**
 * "Repetir" dos formulários de evento e de tarefa.
 *
 * Como a série é criada de uma vez (migration 52), "até quando" é obrigatório
 * e a prévia diz, antes de salvar, quantas ocorrências vão nascer — é o
 * "perguntar até quando criar".
 */
export function RecurrenceFields({
  value,
  onChange,
  startDate,
  pluralNoun,
  errors = {},
}: RecurrenceFieldsProps) {
  const type = value.recurrence_type || ''
  const ends = value.recurrence_ends ?? 'until'

  // Prévia só com a regra completa e válida — senão o erro do campo já fala.
  const rule = toRecurrenceRule({ ...value, recurrence_ends: ends })
  const preview =
    rule && startDate && !recurrenceIssue({ ...value, recurrence_ends: ends }, startDate)
      ? expandOccurrences(startDate, rule)
      : null
  const lastDate = preview?.dates[preview.dates.length - 1]

  return (
    <div className="space-y-3">
      <Select
        value={type || NONE_VALUE}
        onValueChange={(v) =>
          onChange({
            recurrence_type: v === NONE_VALUE ? '' : (v as RecurrenceType),
            recurrence_ends: ends,
          })
        }
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>Não se repete</SelectItem>
          {RECURRENCE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {RECURRENCE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors.recurrence_type && (
        <p className="text-[11px] text-destructive">{errors.recurrence_type}</p>
      )}

      {type && (
        <div className="pl-3 border-l-2 border-violet-200 dark:border-violet-800 space-y-3">
          <p className="text-xs text-muted-foreground">Termina</p>

          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="recurrence_ends"
                checked={ends === 'until'}
                onChange={() => onChange({ recurrence_ends: 'until' })}
                className="accent-primary"
              />
              <span className="w-12 shrink-0">Em</span>
              <Input
                type="date"
                value={value.recurrence_until ?? ''}
                min={startDate ?? undefined}
                disabled={ends !== 'until'}
                onChange={(e) => onChange({ recurrence_until: e.target.value })}
                className="h-8 text-sm max-w-[180px]"
              />
            </label>
            {ends === 'until' && errors.recurrence_until && (
              <p className="text-[11px] text-destructive pl-6">{errors.recurrence_until}</p>
            )}

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="recurrence_ends"
                checked={ends === 'count'}
                onChange={() => onChange({ recurrence_ends: 'count' })}
                className="accent-primary"
              />
              <span className="w-12 shrink-0">Após</span>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={MAX_OCCURRENCES}
                value={value.recurrence_count ?? ''}
                disabled={ends !== 'count'}
                onChange={(e) => onChange({ recurrence_count: e.target.value })}
                className="h-8 text-sm w-20"
              />
              <span className="text-muted-foreground">ocorrências</span>
            </label>
            {ends === 'count' && errors.recurrence_count && (
              <p className="text-[11px] text-destructive pl-6">{errors.recurrence_count}</p>
            )}
          </div>

          {preview && lastDate && (
            <p
              className={cn(
                'flex items-start gap-1.5 text-[11px]',
                preview.truncated ? 'text-warning' : 'text-muted-foreground'
              )}
            >
              {preview.truncated ? (
                <TriangleAlert className="h-3 w-3 mt-px shrink-0" />
              ) : (
                <RefreshCw className="h-3 w-3 mt-px shrink-0" />
              )}
              <span>
                {/* "Série com", não "serão criados/criadas": serve para os dois gêneros. */}
                Série com {preview.dates.length} {pluralNoun}, de{' '}
                {format(parseISO(preview.dates[0]), 'dd/MM/yyyy', { locale: ptBR })} a{' '}
                {format(parseISO(lastDate), 'dd/MM/yyyy', { locale: ptBR })}.
                {preview.truncated && ` Limite de ${MAX_OCCURRENCES} por série — o resto não será criado.`}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
