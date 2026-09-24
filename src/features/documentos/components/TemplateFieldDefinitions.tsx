'use client'

import { AlertTriangle, PenLine, Sparkles } from 'lucide-react'
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
import {
  MANUAL_FIELD_FORMAT_LABELS,
  MANUAL_FIELD_FORMATS,
  SPELLABLE_FORMATS,
  type ManualFieldFormat,
  type TemplateFieldSettings,
} from '@/types/documentTemplate.types'
import { isCatalogField, suggestCatalogField } from '../templates/catalog'
import {
  classifyTemplateFields,
  inferFieldSetting,
  SPELLED_SUFFIX,
  type AiFieldDefinition,
  type ManualFieldDefinition,
} from '../templates/fieldSettings'

interface TemplateFieldDefinitionsProps {
  fields: readonly string[]
  settings: TemplateFieldSettings
  onChange: (settings: TemplateFieldSettings) => void
}

type Definition =
  | { kind: 'manual'; field: ManualFieldDefinition }
  | { kind: 'ai'; field: AiFieldDefinition }

/** Campos definíveis na ordem do documento. `{x_extenso}` aparece como `x`. */
function definableNames(fields: readonly string[]): string[] {
  const names: string[] = []
  for (const field of fields) {
    if (isCatalogField(field)) continue
    const base = field.endsWith(SPELLED_SUFFIX) ? field.slice(0, -SPELLED_SUFFIX.length) : null
    const name = base && !isCatalogField(base) ? base : field
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Definição dos campos que não são do cadastro: manual ou IA, rótulo, formato
 * e instrução. É o que a tela de geração e o Assistente usam para pedir cada
 * valor — e o que impede a IA de "redigir" um valor de honorários.
 */
export function TemplateFieldDefinitions({
  fields,
  settings,
  onChange,
}: TemplateFieldDefinitionsProps) {
  const { manual, ai } = classifyTemplateFields(fields, settings)
  const byName = new Map<string, Definition>([
    ...manual.map((field): [string, Definition] => [field.name, { kind: 'manual', field }]),
    ...ai.map((field): [string, Definition] => [field.name, { kind: 'ai', field }]),
  ])
  const definitions = definableNames(fields).flatMap((name) => byName.get(name) ?? [])

  if (definitions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Todos os campos são do cadastro — o sistema preenche tudo sozinho.
      </p>
    )
  }

  function update(name: string, next: TemplateFieldSettings[string]) {
    onChange({ ...settings, [name]: next })
  }

  return (
    <div className="space-y-3">
      {definitions.map((definition) => {
        const { field } = definition
        const suggestion = suggestCatalogField(field.name)
        const spelled = definition.kind === 'manual' && definition.field.spelled
        return (
          <div key={field.name} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{`{${field.name}}`}</span>
              {spelled && (
                <span className="text-[11px] text-muted-foreground">
                  + {`{${field.name}${SPELLED_SUFFIX}}`}
                </span>
              )}
              <div className="ml-auto flex rounded-md border p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (definition.kind === 'manual') return
                    const inferred = inferFieldSetting(field.name)
                    update(field.name, {
                      kind: 'manual',
                      label: field.label,
                      format: inferred.kind === 'manual' ? inferred.format : 'text',
                    })
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-0.5',
                    definition.kind === 'manual' && 'bg-accent text-accent-foreground',
                  )}
                >
                  <PenLine className="h-3 w-3" /> Manual
                </button>
                <button
                  type="button"
                  disabled={spelled}
                  title={spelled ? 'Campo com versão por extenso é sempre manual.' : undefined}
                  onClick={() => {
                    if (definition.kind === 'ai') return
                    update(field.name, { kind: 'ai', label: field.label, instruction: '' })
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-0.5 disabled:opacity-40',
                    definition.kind === 'ai' && 'bg-primary/10 text-primary',
                  )}
                >
                  <Sparkles className="h-3 w-3" /> IA
                </button>
              </div>
            </div>

            {suggestion && (
              <p className="flex items-start gap-1.5 rounded bg-warning/15 px-2 py-1 text-xs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                Parece {`{${suggestion}}`}, do cadastro. Se for isso, corrija o nome no Word e envie
                o arquivo de novo.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <Input
                value={field.label}
                maxLength={80}
                onChange={(event) => {
                  const label = event.target.value
                  update(
                    field.name,
                    definition.kind === 'manual'
                      ? { kind: 'manual', label, format: definition.field.format }
                      : { kind: 'ai', label, instruction: definition.field.instruction },
                  )
                }}
                placeholder="Rótulo na tela de geração"
                aria-label={`Rótulo de {${field.name}}`}
              />
              {definition.kind === 'manual' && (
                <Select
                  value={definition.field.format}
                  onValueChange={(value) =>
                    update(field.name, {
                      kind: 'manual',
                      label: definition.field.label,
                      format: value as ManualFieldFormat,
                    })
                  }
                >
                  <SelectTrigger className="h-9" aria-label={`Formato de {${field.name}}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(spelled ? SPELLABLE_FORMATS : MANUAL_FIELD_FORMATS).map((format) => (
                      <SelectItem key={format} value={format}>
                        {MANUAL_FIELD_FORMAT_LABELS[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {definition.kind === 'ai' && (
              <Textarea
                value={definition.field.instruction}
                maxLength={1000}
                rows={2}
                onChange={(event) =>
                  update(field.name, {
                    kind: 'ai',
                    label: definition.field.label,
                    instruction: event.target.value,
                  })
                }
                placeholder={
                  'Instrução para a IA. Ex.: narre os fatos em ordem cronológica, em 3 a 5 ' +
                  'parágrafos, só com o que estiver nas anotações e nos documentos.'
                }
                aria-label={`Instrução de {${field.name}}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
