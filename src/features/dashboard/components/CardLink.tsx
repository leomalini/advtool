import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CardLinkProps {
  href: string
  children: React.ReactNode
  /** Ink of the footer's main link; the header's links stay muted. */
  strong?: boolean
  className?: string
}

/** "Abrir agenda →", "Ver quadro →": where the card's subject lives in full. */
export function CardLink({ href, children, strong = false, className }: CardLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm text-xs font-semibold whitespace-nowrap',
        'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        strong ? 'text-foreground hover:underline' : 'text-muted-foreground',
        className
      )}
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  )
}
