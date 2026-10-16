'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { roleKeyFromLabel } from '@/features/documentos/templates/partyFields'
import { PARTY_ROLE_PRESETS } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'

const CUSTOM = '__custom__'

interface PartyRolePickerProps {
  value: TemplatePartyRole | null
  onChange: (role: TemplatePartyRole) => void
  /** Os papéis do modelo do contrato vêm primeiro: são os que a minuta usa. */
  templateRoles: readonly TemplatePartyRole[]
  id?: string
}

/** O papel de uma parte: um do modelo, um comum ou um digitado. */
export function PartyRolePicker({ value, onChange, templateRoles, id }: PartyRolePickerProps) {
  const others = PARTY_ROLE_PRESETS.filter(
    (preset) => !templateRoles.some((role) => role.key === preset.key),
  )
  const known = [...templateRoles, ...others]
  const isCustom = value !== null && !known.some((role) => role.key === value.key)
  const [typing, setTyping] = useState(isCustom)

  if (typing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          autoFocus
          value={value?.label ?? ''}
          onChange={(event) => {
            const label = event.target.value
            onChange({ key: roleKeyFromLabel(label), label })
          }}
          placeholder="Ex.: Promitente comprador"
          maxLength={60}
          className="h-9"
        />
        <button
          type="button"
          onClick={() => setTyping(false)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Da lista
        </button>
      </div>
    )
  }

  return (
    <Select
      value={value && known.some((role) => role.key === value.key) ? value.key : ''}
      onValueChange={(key) => {
        if (key === CUSTOM) {
          setTyping(true)
          return
        }
        const role = known.find((item) => item.key === key)
        if (role) onChange(role)
      }}
    >
      <SelectTrigger id={id} className="h-9 w-full" aria-label="Papel">
        <SelectValue placeholder="Escolha o papel" />
      </SelectTrigger>
      <SelectContent>
        {templateRoles.length > 0 && (
          <SelectGroup>
            <SelectLabel>Do modelo</SelectLabel>
            {templateRoles.map((role) => (
              <SelectItem key={role.key} value={role.key}>
                {role.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectGroup>
          {templateRoles.length > 0 && <SelectLabel>Outros</SelectLabel>}
          {others.map((role) => (
            <SelectItem key={role.key} value={role.key}>
              {role.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Outro…</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
