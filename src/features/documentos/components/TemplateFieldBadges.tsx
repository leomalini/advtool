'use client'

import { ListChecks, PenLine, Sparkles, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { TemplateFieldSettings, TemplatePartyRole } from '@/types/documentTemplate.types'
import { classifyTemplateFields } from '../templates/fieldSettings'

interface TemplateFieldBadgesProps {
  fields: readonly string[]
  settings: TemplateFieldSettings
  /** Papéis de parte declarados no modelo (Contratos). */
  roles?: readonly TemplatePartyRole[]
}

/** Campos de um modelo por tipo, com marcação diferente para não confundir o
 * que o sistema preenche, o que vem das partes, o que se digita e o que a IA
 * redige. */
export function TemplateFieldBadges({ fields, settings, roles = [] }: TemplateFieldBadgesProps) {
  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum campo encontrado no arquivo.</p>
  }

  const { cadastro, party, manual, choice, ai } = classifyTemplateFields(fields, settings, roles)

  return (
    <div className="flex flex-wrap gap-1.5">
      {cadastro.map((field) => (
        <Badge
          key={field}
          variant="secondary"
          className="font-mono text-[11px]"
          title="Do cadastro — o sistema preenche"
        >
          {`{${field}}`}
        </Badge>
      ))}
      {party.map((field) => (
        <Badge
          key={field.name}
          variant="secondary"
          className="gap-1 font-mono text-[11px]"
          title={`Da parte "${field.role.label}" do contrato`}
        >
          <UserRound className="h-3 w-3" />
          {`{${field.name}}`}
        </Badge>
      ))}
      {manual.map((field) => (
        <Badge
          key={field.name}
          variant="outline"
          className="gap-1 font-mono text-[11px]"
          title={`Manual — digitado ao gerar (${field.label})`}
        >
          <PenLine className="h-3 w-3" />
          {`{${field.name}}`}
          {field.spelled && <span className="text-muted-foreground">+extenso</span>}
        </Badge>
      ))}
      {choice.map((field) => (
        <Badge
          key={field.name}
          variant="outline"
          className="gap-1 font-mono text-[11px]"
          title={`Opções — escolhidas ao gerar (${field.options.map((o) => o.label).join(' · ')})`}
        >
          <ListChecks className="h-3 w-3" />
          {`{${field.name}}`}
          <span className="text-muted-foreground">{field.options.length}</span>
        </Badge>
      ))}
      {ai.map((field) => (
        <Badge
          key={field.name}
          variant="outline"
          className="gap-1 border-primary/40 font-mono text-[11px] text-primary"
          title={`IA — redigido e revisado ao gerar (${field.label})`}
        >
          <Sparkles className="h-3 w-3" />
          {`{${field.name}}`}
        </Badge>
      ))}
    </div>
  )
}
