import { cn } from '@/lib/utils'
import { categoryChipClass, categoryMeta } from '../utils/categories'

interface MovementCategoryChipProps {
  /** `legal_process_movements.category`. Valor desconhecido cai em "Outros". */
  category: string
  className?: string
}

/**
 * A natureza do ato, na cor do grupo que o representa no gráfico de Pulso.
 *
 * Componente compartilhado de propósito: a listagem de `/movimentacoes` e a
 * timeline dentro do processo mostram o mesmo ato, e um chip divergente entre
 * as duas telas seria lido como classificação diferente.
 */
export function MovementCategoryChip({ category, className }: MovementCategoryChipProps) {
  const meta = categoryMeta(category)
  const Icon = meta.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        categoryChipClass(category),
        className,
      )}
    >
      <Icon aria-hidden className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  )
}
