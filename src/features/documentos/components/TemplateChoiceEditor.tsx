'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  MAX_CHOICE_LABEL,
  MAX_CHOICE_OPTIONS,
  MAX_CHOICE_TEXT,
} from '@/schemas/documentTemplate.schema'
import {
  CHOICE_JOIN_LABELS,
  type ChoiceJoin,
  type TemplateChoiceOption,
  type TemplateFieldSetting,
} from '@/types/documentTemplate.types'

type ChoiceSetting = Extract<TemplateFieldSetting, { kind: 'choice' }>

interface TemplateChoiceEditorProps {
  fieldName: string
  setting: ChoiceSetting
  onChange: (setting: ChoiceSetting) => void
}

export function newChoiceOption(): TemplateChoiceOption {
  return { id: crypto.randomUUID(), label: '', text: '' }
}

/**
 * As opções de um campo de opções: o rótulo é o que aparece na hora de
 * escolher; o texto, o que vai para o documento — assim uma escolha curta
 * ("Parcelado") pode inserir uma cláusula inteira.
 */
export function TemplateChoiceEditor({ fieldName, setting, onChange }: TemplateChoiceEditorProps) {
  const { options } = setting

  function updateOption(id: string, patch: Partial<TemplateChoiceOption>) {
    onChange({
      ...setting,
      options: options.map((option) => (option.id === id ? { ...option, ...patch } : option)),
    })
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= options.length) return
    const next = [...options]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ ...setting, options: next })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        O rótulo aparece na hora de escolher; o texto é o que entra no documento (vazio, entra o
        rótulo).
      </p>

      {options.map((option, index) => (
        <div key={option.id} className="space-y-1.5 rounded-md border bg-muted/30 p-2">
          <div className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
              {index + 1}
            </span>
            <Input
              value={option.label}
              maxLength={MAX_CHOICE_LABEL}
              onChange={(event) => updateOption(option.id, { label: event.target.value })}
              placeholder="Rótulo — ex.: Parcelado"
              className="h-8"
              aria-label={`Rótulo da opção ${index + 1} de {${fieldName}}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label="Subir opção"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === options.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Descer opção"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                onChange({ ...setting, options: options.filter((item) => item.id !== option.id) })
              }
              aria-label="Remover opção"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Textarea
            value={option.text}
            maxLength={MAX_CHOICE_TEXT}
            rows={2}
            onChange={(event) => updateOption(option.id, { text: event.target.value })}
            placeholder="Texto no documento (opcional). Linha em branco separa parágrafos."
            className="ml-6 w-[calc(100%-1.5rem)] text-sm"
            aria-label={`Texto da opção ${index + 1} de {${fieldName}}`}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={options.length >= MAX_CHOICE_OPTIONS}
        onClick={() => onChange({ ...setting, options: [...options, newChoiceOption()] })}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar opção
      </Button>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={setting.multiple}
            onCheckedChange={(checked) => onChange({ ...setting, multiple: checked === true })}
          />
          Permitir escolher mais de uma
        </label>
        {setting.multiple && (
          <Select
            value={setting.joinWith}
            onValueChange={(value) => onChange({ ...setting, joinWith: value as ChoiceJoin })}
          >
            <SelectTrigger className="h-8 w-56" aria-label={`Como juntar {${fieldName}}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHOICE_JOIN_LABELS) as ChoiceJoin[]).map((join) => (
                <SelectItem key={join} value={join}>
                  {CHOICE_JOIN_LABELS[join]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
