'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowColumn } from '@/types/workflow.types'
import type { CaseWithRelations } from '@/types/case.types'
import { SortableCasoCard } from './SortableCasoCard'

interface CrmKanbanColumnProps {
  coluna: WorkflowColumn
  cases: CaseWithRelations[]
  onCardClick: (caso: CaseWithRelations) => void
  onAddCase: () => void
}

export function CrmKanbanColumn({ coluna, cases, onCardClick, onAddCase }: CrmKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id })

  const caseIds = cases.map((c) => c.id)

  return (
    <div
      className={cn(
        'flex flex-col w-[262px] flex-shrink-0 rounded-xl transition-all duration-200',
        isOver ? 'bg-accent/60' : 'bg-muted/40'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: coluna.cor }}
          />
          <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">
            {coluna.nome}
          </h3>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground bg-foreground/[0.07] px-1.5 py-0.5 rounded-full">
          {cases.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 flex flex-col gap-2 px-2 pb-2 min-h-[80px] overflow-y-auto max-h-[calc(100vh-220px)]"
      >
        <SortableContext items={caseIds} strategy={verticalListSortingStrategy}>
          {cases.map((caso) => (
            <SortableCasoCard
              key={caso.id}
              caso={caso}
              onClick={() => onCardClick(caso)}
            />
          ))}
        </SortableContext>

        {cases.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            Sem casos
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 pb-2">
        <button
          onClick={onAddCase}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-200"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar caso
        </button>
      </div>
    </div>
  )
}
