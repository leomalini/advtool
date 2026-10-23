import { CheckCircle2, CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Uma linha de situação de integração: verde quando está pronto, amarelo
 * quando falta algo — e o porquê embaixo. */
export function StatusRow({
  ok,
  title,
  children,
}: {
  ok: boolean
  title: string
  children: React.ReactNode
}) {
  const Icon = ok ? CheckCircle2 : CircleAlert
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        className={cn('mt-0.5 h-4 w-4 shrink-0', ok ? 'text-success' : 'text-warning')}
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-xs text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}
