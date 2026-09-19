import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AttachmentCountBadgeProps {
  count: number
  className?: string
}

/** Clipe com a quantidade de documentos do lançamento. Some quando não há
 * nenhum — um zero em toda linha viraria ruído. */
export function AttachmentCountBadge({ count, className }: AttachmentCountBadgeProps) {
  if (count === 0) return null

  const label = count === 1 ? '1 documento anexado' : `${count} documentos anexados`

  return (
    <span
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground',
        className
      )}
    >
      <Paperclip className="h-3 w-3" aria-hidden />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
