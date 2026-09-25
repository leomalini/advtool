'use client'

import { useState } from 'react'
import { AlertTriangle, ListChecks, PenLine, Sparkles, type LucideIcon } from 'lucide-react'
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
  type TemplateFieldKind,
  type TemplateFieldSetting,
  type TemplateFieldSettings,
} from '@/types/documentTemplate.types'
import { suggestCatalogField } from '../templates/catalog'
import {
  classifyTemplateFields,
  definableFieldNames,
  inferFieldSetting,
  SPELLED_SUFFIX,
  type AiFieldDefinition,
  type ChoiceFieldDefinition,
  type ManualFieldDefinition,
} from '../templates/fieldSettings'
import { newChoiceOption, TemplateChoiceEditor } from './TemplateChoiceEditor'

interface TemplateFieldDefinitionsProps {
  fields: readonly string[]
  settings: TemplateFieldSettings
  onChange: (settings: TemplateFieldSettings) => void
}

type Definition =
  | { kind: 'manual'; field: ManualFieldDefinition }
  | { kind: 'choice'; field: ChoiceFieldDefinition }
  | { kind: 'ai'; field: AiFieldDefinition }

type ChoiceSetting = Extract<TemplateFieldSetting, { kind: 'choice' }>

/** O que saiu de cada campo ao trocar de tipo, por nome e tipo. */
type KindStash = Record<string, Partial<Record<TemplateFieldKind, TemplateFieldSetting>>>

const KINDS: ReadonlyArray<{ kind: TemplateFieldKind; label: string; icon: LucideIcon }> = [
  { kind: 'manual', label: 'Manual', icon: PenLine },
  { kind: 'choice', label: 'Opções', icon: ListChecks },
  { kind: 'ai', label: 'IA', icon: Sparkles },
]

function choiceSettingOf(field: ChoiceFieldDefinition): ChoiceSetting {
  const { label, options, multiple, joinWith } = field
  return { kind: 'choice', label, options, multiple, joinWith }
}

function settingOf(definition: Definition): TemplateFieldSetting {
  switch (definition.kind) {
    case 'manual':
      return { kind: 'manual', label: definition.field.label, format: definition.field.format }
    case 'choice':
      return choiceSettingOf(definition.field)
    case 'ai':
      return {
        kind: 'ai',
        label: definition.field.label,
        instruction: definition.field.instruction,
      }
  }
}

function defaultSetting(
  kind: TemplateFieldKind,
  name: string,
  label: string,
): TemplateFieldSetting {
  switch (kind) {
    case 'manual': {
      const inferred = inferFieldSetting(name)
      return { kind, label, format: inferred.kind === 'manual' ? inferred.format : 'text' }
    }
    case 'choice':
      return { kind, label, options: [newChoiceOption()], multiple: false, joinWith: 'list' }
    case 'ai':
      return { kind, label, instruction: '' }
  }
}

/**
 * Definição dos campos que não são do cadastro: manual, opções ou IA, com
 * rótulo, formato, opções e instrução. É o que a tela de geração e o
 * Assistente usam para pedir cada valor — e o que impede a IA de "redigir" um
 * valor de honorários.
 */
export function TemplateFieldDefinitions({
  fields,
  settings,
  onChange,
}: TemplateFieldDefinitionsProps) {
  // Trocar de tipo sem querer não pode apagar as opções ou a instrução já
  // digitadas: o que sai fica guardado aqui e volta se o tipo voltar.
  const [stash, setStash] = useState<KindStash>({})
  const { manual, choice, ai } = classifyTemplateFields(fields, settings)
  const byName = new Map<string, Definition>([
    ...manual.map((field): [string, Definition] => [field.name, { kind: 'manual', field }]),
    ...choice.map((field): [string, Definition] => [field.name, { kind: 'choice', field }]),
    ...ai.map((field): [string, Definition] => [field.name, { kind: 'ai', field }]),
  ])
  const definitions = definableFieldNames(fields).flatMap((name) => byName.get(name) ?? [])

  if (definitions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Todos os campos são do cadastro — o sistema preenche tudo sozinho.
      </p>
    )
  }

  function update(name: string, next: TemplateFieldSetting) {
    onChange({ ...settings, [name]: next })
  }

  function switchKind(definition: Definition, kind: TemplateFieldKind) {
    if (definition.kind === kind) return
    const { name, label } = definition.field
    const current = settingOf(definition)
    setStash((previous) => ({
      ...previous,
      [name]: { ...previous[name], [current.kind]: current },
    }))
    const restored = stash[name]?.[kind]
    update(name, restored ? { ...restored, label } : defaultSetting(kind, name, label))
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
              <span className="min-w-0 break-all font-mono text-xs">{`{${field.name}}`}</span>
              {spelled && (
                <span className="text-[11px] text-muted-foreground">
                  + {`{${field.name}${SPELLED_SUFFIX}}`}
                </span>
              )}
              <div className="ml-auto flex rounded-md border p-0.5 text-xs">
                {KINDS.map(({ kind, label, icon: Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={spelled && kind !== 'manual'}
                    title={
                      spelled && kind !== 'manual'
                        ? 'Campo com versão por extenso é sempre manual.'
                        : undefined
                    }
                    onClick={() => switchKind(definition, kind)}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-0.5 disabled:opacity-40',
                      definition.kind === kind &&
                        (kind === 'ai'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-accent text-accent-foreground'),
                    )}
                    aria-pressed={definition.kind === kind}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </button>
                ))}
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
                onChange={(event) =>
                  update(field.name, { ...settingOf(definition), label: event.target.value })
                }
                placeholder="Rótulo na tela de geração"
                aria-label={`Rótulo de {${field.name}}`}
                className="min-w-0"
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
                  <SelectTrigger className="h-9 w-full" aria-label={`Formato de {${field.name}}`}>
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

            {definition.kind === 'choice' && (
              <TemplateChoiceEditor
                fieldName={field.name}
                setting={choiceSettingOf(definition.field)}
                onChange={(next) => update(field.name, next)}
              />
            )}

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
