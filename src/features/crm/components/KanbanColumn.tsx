'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeadCard } from './LeadCard'
import type { KanbanColumn as KanbanColumnType } from '@/types/lead.types'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  column: KanbanColumnType
  onAddLead: (stageId: string) => void
}

export function KanbanColumn({ column, onAddLead }: KanbanColumnProps) {
  const { stage, leads } = column
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="text-sm font-semibold truncate">{stage.name}</span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {leads.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onAddLead(stage.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Drop Zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-lg p-2 space-y-2 min-h-[200px] transition-colors',
          isOver ? 'bg-accent' : 'bg-muted/40'
        )}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-full py-8">
            <p className="text-xs text-muted-foreground">Arraste leads aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}
