'use client'

import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ManualFieldDefinition } from '../templates/fieldSettings'
import { formatManualValue } from '../templates/values'

interface GenerateManualFieldsProps {
  fields: readonly ManualFieldDefinition[]
  /** Valor cru por campo: número com ponto decimal, data 'yyyy-MM-dd', texto. */
  values: Readonly<Record<string, string>>
  onChange: (name: string, value: string) => void
}

function ManualFieldControl({
  field,
  value,
  onChange,
}: {
  field: ManualFieldDefinition
  value: string
  onChange: (value: string) => void
}) {
  const id = `manual-${field.name}`
  switch (field.format) {
    case 'currency': {
      const number = value === '' ? undefined : Number(value)
      return (
        <CurrencyInput
          id={id}
          value={number}
          onChange={(next) => onChange(next === undefined ? '' : String(next))}
        />
      )
    }
    case 'date':
      return (
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'number':
    case 'percent':
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.format === 'percent' ? 'Ex.: 30' : undefined}
        />
      )
    case 'long_text':
      return (
        <Textarea
          id={id}
          value={value}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Linha em branco separa parágrafos."
        />
      )
    case 'text':
      return <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
  }
}

/** Campos que quem gera digita, no formato definido no modelo. Com versão por
 * extenso, a tela mostra como o valor vai sair. */
export function GenerateManualFields({ fields, values, onChange }: GenerateManualFieldsProps) {
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = values[field.name] ?? ''
        const preview = field.spelled ? formatManualValue(field.format, value) : null
        return (
          <div key={field.name} className="space-y-1">
            <label htmlFor={`manual-${field.name}`} className="flex items-baseline gap-2 text-sm">
              {field.label}
              <span className="font-mono text-[11px] text-muted-foreground">
                {`{${field.name}}`}
              </span>
            </label>
            <ManualFieldControl
              field={field}
              value={value}
              onChange={(next) => onChange(field.name, next)}
            />
            {preview?.spelled && (
              <p className="text-xs text-muted-foreground">
                {preview.value} ({preview.spelled})
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
