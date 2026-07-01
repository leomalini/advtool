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
import { useCrmCasosStore } from '../stores/casos.store'
import type { Workflow, Caso } from '@/data/mock'

interface CrmKanbanBoardProps {
  workflow: Workflow
}

export function CrmKanbanBoard({ workflow }: CrmKanbanBoardProps) {
  const casos = useCrmCasosStore((s) => s.casos)
  const moveCaso = useCrmCasosStore((s) => s.moveCaso)
  const openModal = useCrmCasosStore((s) => s.openModal)

  const [activeCasoId, setActiveCasoId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const workflowCasos = casos.filter((c) => c.workflowId === workflow.id)
  const columnIds = workflow.colunas.map((c) => c.id)

  function getCasosByColuna(colunaId: string): Caso[] {
    return workflowCasos
      .filter((c) => c.colunaId === colunaId)
      .sort((a, b) => a.position - b.position)
  }

  const activeCaso = activeCasoId
    ? workflowCasos.find((c) => c.id === activeCasoId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveCasoId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeCasoItem = workflowCasos.find((c) => c.id === activeId)
    if (!activeCasoItem) return

    const isOverColumn = columnIds.includes(overId)
    if (isOverColumn && activeCasoItem.colunaId !== overId) {
      moveCaso(activeId, overId)
      return
    }

    const overCaso = workflowCasos.find((c) => c.id === overId)
    if (overCaso && activeCasoItem.colunaId !== overCaso.colunaId) {
      moveCaso(activeId, overCaso.colunaId)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCasoId(null)

    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const activeCasoItem = workflowCasos.find((c) => c.id === activeId)
    if (!activeCasoItem) return

    const isOverColumn = columnIds.includes(overId)
    if (isOverColumn) {
      moveCaso(activeId, overId)
      return
    }

    const overCaso = workflowCasos.find((c) => c.id === overId)
    if (overCaso && activeCasoItem.colunaId !== overCaso.colunaId) {
      moveCaso(activeId, overCaso.colunaId)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={workflowCasos.map((c) => c.id)}>
        <div className="flex gap-3 h-full overflow-x-auto pb-4">
          {workflow.colunas
            .slice()
            .sort((a, b) => a.posicao - b.posicao)
            .map((coluna) => (
              <CrmKanbanColumn
                key={coluna.id}
                coluna={coluna}
                casos={getCasosByColuna(coluna.id)}
                onCardClick={openModal}
              />
            ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeCaso && (
          <div className="rotate-2 scale-105 shadow-2xl">
            <CasoCard caso={activeCaso} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
