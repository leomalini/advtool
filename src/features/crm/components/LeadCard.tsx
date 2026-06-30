'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageSquare, Phone, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LEAD_ORIGIN_LABELS } from '@/types/lead.types'
import { Badge } from '@/components/ui/badge'
import { useCrmStore } from '@/store/crm.store'
import type { LeadWithRelations } from '@/types/lead.types'
import { formatRelative } from '@/utils/date'

interface LeadCardProps {
  lead: LeadWithRelations
}

export function LeadCard({ lead }: LeadCardProps) {
  const { openDrawer } = useCrmStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
      onClick={() => openDrawer(lead)}
    >
      <p className="text-sm font-medium truncate mb-2">{lead.name}</p>

      <div className="flex flex-col gap-1 mb-2">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {lead.origin && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {LEAD_ORIGIN_LABELS[lead.origin]}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
          </span>
          <span>{formatRelative(lead.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
