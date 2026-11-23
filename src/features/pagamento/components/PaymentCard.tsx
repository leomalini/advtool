import { Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

/** O cartão central das páginas públicas de pagamento: ícone, título e o que
 * vier embaixo. A página do cliente e a de retorno do checkout usam o mesmo. */
export function PaymentCard({
  icon,
  title,
  eyebrow,
  children,
}: {
  icon: React.ReactNode
  title: string
  /** Linha pequena acima do título — o nome do escritório. */
  eyebrow?: string | null
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-md flex-col items-center gap-3',
        'px-4 py-16 text-center',
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}

export function ReceiptLink({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <Receipt className="size-4" aria-hidden />
      Ver o comprovante
    </a>
  )
}
