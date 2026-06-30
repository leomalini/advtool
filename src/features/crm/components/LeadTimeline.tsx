'use client'

import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeadMovements } from '../hooks/useLeads'
import { formatDateTime } from '@/utils/date'

interface LeadTimelineProps {
  leadId: string
}

export function LeadTimeline({ leadId }: LeadTimelineProps) {
  const { data: movements, isLoading } = useLeadMovements(leadId)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (!movements?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma movimentação ainda.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {movements.map((movement) => (
        <div
          key={movement.id}
          className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5"
        >
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              {movement.from_stage ? (
                <>
                  <span
                    className="font-medium"
                    style={{ color: movement.from_stage.color }}
                  >
                    {movement.from_stage.name}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </>
              ) : null}
              <span
                className="font-medium"
                style={{ color: movement.to_stage?.color }}
              >
                {movement.to_stage?.name}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              por {movement.mover?.full_name} · {formatDateTime(movement.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
