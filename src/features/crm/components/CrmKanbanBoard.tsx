'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { useCases, caseKeys } from '../hooks/useCases'
import { useOptimisticMoveCase } from '../hooks/useCaseMutations'
import { insertColumnHistory } from '../services/cases.service'
import { useAuth } from '@/hooks/useAuth'
import type { Workflow } from '@/types/workflow.types'
import type { CaseWithRelations } from '@/types/case.types'

interface CrmKanbanBoardProps {
  workflow: Workflow
}

export function CrmKanbanBoard({ workflow }: CrmKanbanBoardProps) {
  const openModal = useCrmUiStore((s) => s.openModal)
  const openCreateModal = useCrmUiStore((s) => s.openCreateModal)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data: cases = [], isLoading } = useCases(workflow.id)
  const moveCase = useOptimisticMoveCase(workflow.id)

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)

  // Captured at dragStart (before any cache mutations) so handleDragEnd always
  // knows the true original column regardless of how many dragOver events fired.
  const dragStartColumnRef = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const columnIds = workflow.colunas.map((c) => c.id)
  const queryKey = caseKeys.workflow(workflow.id)

  function getCasesByColumn(columnId: string): CaseWithRelations[] {
    return cases
      .filter((c) => c.column_id === columnId)
      .sort((a, b) => a.position - b.position)
  }

  const activeCase = activeCaseId
    ? cases.find((c) => c.id === activeCaseId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    setActiveCaseId(id)
    // Read from cache (not from `cases` closure) to avoid stale data.
    const cached = queryClient.getQueryData<CaseWithRelations[]>(queryKey) ?? []
    dragStartColumnRef.current = cached.find((c) => c.id === id)?.column_id ?? null
  }

  // dragOver fires the real PATCH via mutation (+ optimistic cache update).
  // This is the only place cases.column_id is updated in the DB during a drag.
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

  // dragEnd does NOT send another PATCH — the DB is already updated by dragOver.
  // Its only job is to record the move in case_column_history by comparing the
  // original column (captured at dragStart) with the final column (from cache).
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCaseId(null)

    const fromColumnId = dragStartColumnRef.current
    dragStartColumnRef.current = null

    // over=null means the card was dropped outside any droppable (or drag canceled).
    // In that case skip history — the dragOver PATCH already persisted the last column.
    if (!over || !fromColumnId || !user?.id) return

    const activeId = String(active.id)

    // Read final column from cache — onMutate in useOptimisticMoveCase has already
    // applied the optimistic update, so this reflects the last dragOver destination.
    const cached = queryClient.getQueryData<CaseWithRelations[]>(queryKey) ?? []
    const finalCase = cached.find((c) => c.id === activeId)
    if (!finalCase) return

    const toColumnId = finalCase.column_id
    if (toColumnId === fromColumnId) return // dropped back on same column

    // Fire the POST directly — no need for another mutation lifecycle.
    insertColumnHistory(activeId, fromColumnId, toColumnId, user.id).then(() => {
      queryClient.invalidateQueries({ queryKey: caseKeys.columnHistory(activeId) })
    })
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
                onAddCase={() => openCreateModal(coluna.id)}
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
