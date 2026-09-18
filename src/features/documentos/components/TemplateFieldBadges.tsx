'use client'

import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { splitTemplateFields } from '@/features/ia/templates/catalog'

interface TemplateFieldBadgesProps {
  fields: readonly string[]
}

/** Campos de um modelo: os do cadastro (preenchidos pelo sistema) e os que a
 * IA redige, com marcação diferente para não confundir os dois. */
export function TemplateFieldBadges({ fields }: TemplateFieldBadgesProps) {
  const { cadastro, redigidos } = splitTemplateFields(fields)

  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum campo encontrado no arquivo.</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {cadastro.map((field) => (
        <Badge key={field} variant="secondary" className="font-mono text-[11px]">
          {`{${field}}`}
        </Badge>
      ))}
      {redigidos.map((field) => (
        <Badge
          key={field}
          variant="outline"
          className="gap-1 border-primary/40 font-mono text-[11px] text-primary"
          title="Redigido pela IA a partir do que você pedir no chat"
        >
          <Sparkles className="h-3 w-3" />
          {`{${field}}`}
        </Badge>
      ))}
    </div>
  )
}
