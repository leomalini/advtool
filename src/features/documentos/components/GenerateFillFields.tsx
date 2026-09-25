'use client'

import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  ChoiceFieldDefinition,
  FillField,
  ManualFieldDefinition,
} from '../templates/fieldSettings'
import { formatManualValue } from '../templates/values'

/** Valor do Select para "nenhuma opção" — o Radix não aceita item de valor vazio. */
const NO_CHOICE = '__none__'

interface GenerateFillFieldsProps {
  fields: readonly FillField[]
  /** Valor cru por campo manual: número com ponto decimal, data 'yyyy-MM-dd', texto. */
  manual: Readonly<Record<string, string>>
  onManualChange: (name: string, value: string) => void
  /** Ids das opções escolhidas por campo de opções. */
  choices: Readonly<Record<string, readonly string[]>>
  onChoiceChange: (name: string, optionIds: string[]) => void
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
  const id = `fill-${field.name}`
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

/** Texto que a opção põe no documento, para quem escolhe ver o que vai entrar. */
function optionPreview(field: ChoiceFieldDefinition, selected: readonly string[]): string[] {
  return field.options
    .filter((option) => selected.includes(option.id) && option.text.trim())
    .map((option) => option.text.trim())
}

function ChoiceFieldControl({
  field,
  selected,
  onChange,
}: {
  field: ChoiceFieldDefinition
  selected: readonly string[]
  onChange: (optionIds: string[]) => void
}) {
  const previews = optionPreview(field, selected)

  return (
    <div className="space-y-1.5">
      {field.multiple ? (
        <div className="space-y-0.5 rounded-md border p-1">
          {field.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm',
                'hover:bg-accent/50',
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  )
                }
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <Select
          value={selected[0] ?? NO_CHOICE}
          onValueChange={(value) => onChange(value === NO_CHOICE ? [] : [value])}
        >
          <SelectTrigger
            id={`fill-${field.name}`}
            aria-label={field.label}
            className="w-full min-w-0 *:data-[slot=select-value]:min-w-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[min(36rem,calc(100vw-2rem))]">
            <SelectItem value={NO_CHOICE}>
              <span className="text-muted-foreground">Nenhuma</span>
            </SelectItem>
            {field.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="block min-w-0 truncate">{option.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {previews.length > 0 && (
        <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
          {previews.join('\n')}
        </p>
      )}
    </div>
  )
}

/**
 * Campos que quem gera preenche — digitados ou escolhidos entre as opções do
 * modelo —, na ordem do documento. Com versão por extenso, a tela mostra como
 * o valor vai sair; com opção de texto longo, o começo do texto.
 */
export function GenerateFillFields({
  fields,
  manual,
  onManualChange,
  choices,
  onChoiceChange,
}: GenerateFillFieldsProps) {
  return (
    <div className="space-y-4">
      {fields.map((item) => {
        const { field } = item
        const spelled =
          item.kind === 'manual' && item.field.spelled
            ? formatManualValue(item.field.format, manual[field.name] ?? '')
            : null
        return (
          <div key={field.name} className="min-w-0 space-y-1">
            <label
              htmlFor={`fill-${field.name}`}
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm"
            >
              <span className="min-w-0 break-words">{field.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {`{${field.name}}`}
              </span>
              {item.kind === 'choice' && item.field.multiple && (
                <span className="text-[11px] text-muted-foreground">marque uma ou mais</span>
              )}
            </label>
            {item.kind === 'manual' ? (
              <ManualFieldControl
                field={item.field}
                value={manual[field.name] ?? ''}
                onChange={(next) => onManualChange(field.name, next)}
              />
            ) : (
              <ChoiceFieldControl
                field={item.field}
                selected={choices[field.name] ?? []}
                onChange={(ids) => onChoiceChange(field.name, ids)}
              />
            )}
            {spelled?.spelled && (
              <p className="text-xs text-muted-foreground">
                {spelled.value} ({spelled.spelled})
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
