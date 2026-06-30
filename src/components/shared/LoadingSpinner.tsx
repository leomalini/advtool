import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  className?: string
  size?: number
}

export function LoadingSpinner({ className, size = 24 }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Loader2 style={{ width: size, height: size }} className="animate-spin text-muted-foreground" />
    </div>
  )
}
