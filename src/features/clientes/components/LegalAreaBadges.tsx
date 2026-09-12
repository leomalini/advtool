import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { LegalArea } from '@/types/cliente.types'

const BADGE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

interface LegalAreaBadgesProps {
  areas: LegalArea[]
  /** Acima disto as excedentes viram um "+N" com o resto no title — a coluna
   * da listagem não comporta quatro chips. Sem limite, mostra todas. */
  max?: number
  /** O que aparece quando o cliente não tem nenhuma área definida. */
  empty?: React.ReactNode
}

/** As áreas jurídicas de um cliente. Existe porque, desde que a área virou
 * lista (migration 53), os mesmos chips são renderizados na listagem, no
 * resumo e nos dois cabeçalhos do detalhe. */
export function LegalAreaBadges({ areas, max, empty = null }: LegalAreaBadgesProps) {
  if (areas.length === 0) return <>{empty}</>

  const shown = max ? areas.slice(0, max) : areas
  const hidden = areas.slice(shown.length)

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((area) => {
        const meta = AREAS_JURIDICAS[area]
        // Área gravada que não está no catálogo não deve derrubar a linha —
        // some do chip e continua no banco.
        if (!meta) return null
        return (
          <span key={area} className={cn(BADGE, meta.bg, meta.color)}>
            {meta.label}
          </span>
        )
      })}

      {hidden.length > 0 && (
        <span
          className={cn(BADGE, 'bg-muted text-muted-foreground')}
          title={hidden.map((area) => AREAS_JURIDICAS[area]?.label ?? area).join(', ')}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  )
}
