'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { ProfileOption } from '@/components/shared/ProfileOption'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types/common.types'

interface GenerateLawyerPickerProps {
  lawyers: readonly Profile[]
  /** Na ordem da escolha: o primeiro é o de `{advogado_nome}`. */
  selected: readonly string[]
  onChange: (ids: string[]) => void
}

function oabLabel(profile: Profile): string | null {
  if (!profile.oab_number) return null
  return `OAB${profile.oab_state ? `/${profile.oab_state}` : ''} ${profile.oab_number}`
}

/** Advogados do documento — um ou vários (procuração com vários outorgados). */
export function GenerateLawyerPicker({ lawyers, selected, onChange }: GenerateLawyerPickerProps) {
  if (lawyers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum membro ativo com OAB cadastrada. Cadastre a OAB em Configurações → Usuários.
      </p>
    )
  }

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  return (
    <div className="space-y-1">
      {lawyers.map((lawyer) => {
        const position = selected.indexOf(lawyer.id)
        const checked = position !== -1
        return (
          <label
            key={lawyer.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5',
              'hover:bg-accent/50',
            )}
          >
            <Checkbox checked={checked} onCheckedChange={() => toggle(lawyer.id)} />
            <ProfileOption profile={lawyer} className="flex-1" />
            <span className="font-mono text-xs text-muted-foreground">
              {oabLabel(lawyer) ?? 'sem OAB'}
            </span>
            {position === 0 && selected.length > 1 && (
              <span
                className={cn(
                  'rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium',
                  'text-primary',
                )}
              >
                assina
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}
