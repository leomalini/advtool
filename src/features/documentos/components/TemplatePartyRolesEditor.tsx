'use client'

import { useState } from 'react'
import { Plus, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PARTY_ROLE_PRESETS } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { humanizeFieldName } from '../templates/fieldSettings'
import { matchPartyField, roleKeyFromLabel, suggestPartyRoles } from '../templates/partyFields'

const CUSTOM = '__custom__'

/** Rótulo de um prefixo achado no arquivo: o do papel comum, se houver. */
function labelOf(key: string): string {
  return PARTY_ROLE_PRESETS.find((preset) => preset.key === key)?.label ?? humanizeFieldName(key)
}

interface TemplatePartyRolesEditorProps {
  fields: readonly string[]
  roles: TemplatePartyRole[]
  onChange: (roles: TemplatePartyRole[]) => void
}

/**
 * Os papéis de parte do modelo (migration 70). Declarados e não deduzidos —
 * `{imovel_endereco}` parece campo de parte e é do objeto do contrato —, mas
 * o arquivo é lido e os prefixos prováveis aparecem como sugestão.
 */
export function TemplatePartyRolesEditor({ fields, roles, onChange }: TemplatePartyRolesEditorProps) {
  const [customLabel, setCustomLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const suggestions = suggestPartyRoles(fields, roles, labelOf)
  const presets = PARTY_ROLE_PRESETS.filter(
    (preset) => !roles.some((role) => role.key === preset.key),
  )

  function add(role: TemplatePartyRole) {
    if (!role.key || roles.some((item) => item.key === role.key)) return
    onChange([...roles, role])
  }

  function rename(key: string, label: string) {
    onChange(roles.map((role) => (role.key === key ? { ...role, label } : role)))
  }

  function remove(key: string) {
    onChange(roles.filter((role) => role.key !== key))
  }

  function addCustom() {
    const label = customLabel.trim()
    if (!label) return
    add({ key: roleKeyFromLabel(label), label })
    setCustomLabel('')
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      {roles.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum papel. Declare os papéis que o arquivo usa — {'{locatario_nome}'},{' '}
          {'{locatario_qualificacao}'}… — e eles se preenchem com as partes do contrato.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {roles.map((role) => {
            const used = fields.filter((field) => matchPartyField(field, [role]))
            return (
              <li key={role.key} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
                <UserRound className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={role.label}
                      onChange={(event) => rename(role.key, event.target.value)}
                      className="h-8 max-w-[220px]"
                      aria-label={`Nome do papel ${role.key}`}
                      maxLength={60}
                    />
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {`{${role.key}_…}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {used.length === 0
                      ? 'O arquivo não usa nenhum campo deste papel — ele não será salvo.'
                      : `Usados: ${used.map((field) => `{${field}}`).join(' ')}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(role.key)}
                  aria-label={`Tirar o papel ${role.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <span className="text-muted-foreground">Parecem papéis no arquivo:</span>
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.key}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => add(suggestion)}
            >
              <Plus className="h-3 w-3" />
              {suggestion.label}
            </Button>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addCustom()
              }
            }}
            placeholder="Ex.: Promitente comprador"
            className="h-8 max-w-[260px]"
            maxLength={60}
          />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {customLabel.trim() ? `{${roleKeyFromLabel(customLabel)}_…}` : ''}
          </span>
          <Button type="button" size="sm" className="h-8" onClick={addCustom}>
            Adicionar
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Select
          value=""
          onValueChange={(value) => {
            if (value === CUSTOM) setAdding(true)
            else {
              const preset = PARTY_ROLE_PRESETS.find((item) => item.key === value)
              if (preset) add(preset)
            }
          }}
        >
          <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Adicionar papel">
            <SelectValue placeholder="Adicionar papel…" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.key} value={preset.key}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM}>Outro…</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
