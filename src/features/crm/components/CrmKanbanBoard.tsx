'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { CrmKanbanColumn } from './CrmKanbanColumn'
import { CasoCard } from './CasoCard'
import { useCrmUiStore } from '../stores/casos.store'
import { useCases } from '../hooks/useCases'
import { useOptimisticMoveCase } from '../hooks/useCaseMutations'
import type { Workflow } from '@/data/mock'
import type { CaseWithRelations } from '@/types/case.types'

interface CrmKanbanBoardProps {
  workflow: Workflow
}

export function CrmKanbanBoard({ workflow }: CrmKanbanBoardProps) {
  const openModal = useCrmUiStore((s) => s.openModal)
  const { data: cases = [], isLoading } = useCases(workflow.id)
  const moveCase = useOptimisticMoveCase(workflow.id)

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const columnIds = workflow.colunas.map((c) => c.id)

  function getCasesByColumn(columnId: string): CaseWithRelations[] {
    return cases
      .filter((c) => c.column_id === columnId)
      .sort((a, b) => a.position - b.position)
  }

  const activeCase = activeCaseId
    ? cases.find((c) => c.id === activeCaseId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveCaseId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeCase = cases.find((c) => c.id === activeId)
    if (!activeCase) return

    const isOverColumn = columnIds.includes(overId)
    if (isOverColumn && activeCase.column_id !== overId) {
      moveCase.mutate({ id: activeId, columnId: overId, position: 0 })
      return
    }

    const overCase = cases.find((c) => c.id === overId)
    if (overCase && activeCase.column_id !== overCase.column_id) {
      moveCase.mutate({ id: activeId, columnId: overCase.column_id, position: 0 })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCaseId(null)

    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeCase = cases.find((c) => c.id === activeId)
    if (!activeCase) return

    const isOverColumn = columnIds.includes(overId)
    if (isOverColumn) {
      moveCase.mutate({ id: activeId, columnId: overId, position: 0 })
      return
    }

    const overCase = cases.find((c) => c.id === overId)
    if (overCase && activeCase.column_id !== overCase.column_id) {
      moveCase.mutate({ id: activeId, columnId: overCase.column_id, position: 0 })
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 h-full overflow-x-auto pb-4">
        {workflow.colunas.slice(0, 4).map((col) => (
          <div key={col.id} className="w-72 flex-shrink-0 rounded-xl bg-zinc-50 h-32 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={cases.map((c) => c.id)}>
        <div className="flex gap-3 h-full overflow-x-auto pb-4">
          {workflow.colunas
            .slice()
            .sort((a, b) => a.posicao - b.posicao)
            .map((coluna) => (
              <CrmKanbanColumn
                key={coluna.id}
                coluna={coluna}
                cases={getCasesByColumn(coluna.id)}
                onCardClick={(c) => openModal(c.id)}
              />
            ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeCase && (
          <div className="rotate-2 scale-105 shadow-2xl">
            <CasoCard caso={activeCase} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
