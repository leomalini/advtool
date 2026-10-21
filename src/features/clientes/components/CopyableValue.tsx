'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** Valor com botão de copiar — a ficha existe em boa parte para alimentar
 * petições, e cada campo é copiado isoladamente o tempo todo. */
export function CopyableValue({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <span className="group inline-flex items-center gap-1.5 min-w-0">
      <span className={cn('truncate', mono && 'font-mono')}>{value}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value)
          toast.success('Copiado')
        }}
        title="Copiar"
        className="shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
      >
        <Copy className="h-3 w-3" />
      </button>
    </span>
  )
}
