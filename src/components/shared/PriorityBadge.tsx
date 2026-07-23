import { Badge } from '@/components/ui/badge'
import { TASK_PRIORITY_LABELS } from '@/types/task.types'
import type { TaskPriority } from '@/types/task.types'
import { cn } from '@/lib/utils'

const variants: Record<TaskPriority, string> = {
  low: 'bg-success/12 text-success border-success/25',
  medium: 'bg-warning/12 text-warning border-warning/25',
  high: 'bg-chart-4/15 text-chart-4 border-chart-4/30',
  urgent: 'bg-destructive/12 text-destructive border-destructive/25',
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
