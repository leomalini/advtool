'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Skeleton } from '@/components/ui/skeleton'
import { KanbanColumn } from './KanbanColumn'
import { LeadDrawer } from './LeadDrawer'
import { useLeads, useLeadStages } from '../hooks/useLeads'
import { useMoveLead } from '../hooks/useLeadMutations'
import type { KanbanColumn as KanbanColumnType, LeadWithRelations } from '@/types/lead.types'

interface KanbanBoardProps {
  onAddLead: (stageId: string) => void
}

export function KanbanBoard({ onAddLead }: KanbanBoardProps) {
  const { data: leads, isLoading: leadsLoading } = useLeads()
  const { data: stages, isLoading: stagesLoading } = useLeadStages()
  const moveLead = useMoveLead()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localLeads, setLocalLeads] = useState<LeadWithRelations[] | null>(null)

  const displayLeads = localLeads ?? leads ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const columns = useMemo<KanbanColumnType[]>(() => {
    if (!stages) return []
    return stages.map((stage) => ({
      stage,
      leads: displayLeads
        .filter((l) => l.stage_id === stage.id)
        .sort((a, b) => a.position - b.position),
    }))
  }, [stages, displayLeads])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    setLocalLeads(leads ?? [])
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeLeadId = active.id as string
    const overId = over.id as string

    setLocalLeads((prev) => {
      if (!prev) return prev
      const activeLead = prev.find((l) => l.id === activeLeadId)
      if (!activeLead) return prev

      // Dropped over a column (stage id)
      const targetStage = stages?.find((s) => s.id === overId)
      if (targetStage) {
        return prev.map((l) =>
          l.id === activeLeadId ? { ...l, stage_id: targetStage.id } : l
        )
      }

      // Dropped over another lead
      const overLead = prev.find((l) => l.id === overId)
      if (overLead && activeLead.stage_id !== overLead.stage_id) {
        return prev.map((l) =>
          l.id === activeLeadId ? { ...l, stage_id: overLead.stage_id } : l
        )
      }

      return prev
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over || !localLeads) {
      setLocalLeads(null)
      return
    }

    const activeLead = localLeads.find((l) => l.id === active.id)
    if (!activeLead) {
      setLocalLeads(null)
      return
    }

    const targetStageId =
      stages?.find((s) => s.id === over.id)?.id ??
      localLeads.find((l) => l.id === over.id)?.stage_id

    if (!targetStageId) {
      setLocalLeads(null)
      return
    }

    const stageLeads = localLeads
      .filter((l) => l.stage_id === targetStageId)
      .sort((a, b) => a.position - b.position)

    const newPosition = stageLeads.findIndex((l) => l.id === activeLead.id)

    moveLead.mutate({
      lead_id: activeLead.id,
      to_stage_id: targetStageId,
      position: newPosition >= 0 ? newPosition : stageLeads.length,
    })

    setLocalLeads(null)
  }

  if (leadsLoading || stagesLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-64 shrink-0 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 h-full">
          {columns.map((column) => (
            <KanbanColumn
              key={column.stage.id}
              column={column}
              onAddLead={onAddLead}
            />
          ))}
        </div>
      </DndContext>
      <LeadDrawer />
    </>
  )
}
