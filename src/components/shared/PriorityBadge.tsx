import { Badge } from '@/components/ui/badge'
import { TASK_PRIORITY_LABELS } from '@/types/task.types'
import type { TaskPriority } from '@/types/task.types'
import { cn } from '@/lib/utils'

const variants: Record<TaskPriority, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
}

interface PriorityBadgeProps {
  priority: TaskPriority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(variants[priority], className)}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
