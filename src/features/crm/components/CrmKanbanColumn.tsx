'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowColuna, Caso } from '@/data/mock'
import { SortableCasoCard } from './SortableCasoCard'

interface CrmKanbanColumnProps {
  coluna: WorkflowColuna
  casos: Caso[]
  onCardClick: (caso: Caso) => void
}

export function CrmKanbanColumn({ coluna, casos, onCardClick }: CrmKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id })

  const casoIds = casos.map((c) => c.id)

  return (
    <div
      className={cn(
        'flex flex-col w-72 flex-shrink-0 rounded-xl transition-all duration-200',
        isOver ? 'bg-zinc-100' : 'bg-zinc-50'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: coluna.cor }}
          />
          <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
            {coluna.nome}
          </h3>
        </div>
        <span className="text-xs font-medium text-zinc-400 bg-zinc-200 px-1.5 py-0.5 rounded-full">
          {casos.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 flex flex-col gap-2 px-2 pb-2 min-h-[80px] overflow-y-auto max-h-[calc(100vh-220px)]"
      >
        <SortableContext items={casoIds} strategy={verticalListSortingStrategy}>
          {casos.map((caso) => (
            <SortableCasoCard
              key={caso.id}
              caso={caso}
              onClick={() => onCardClick(caso)}
            />
          ))}
        </SortableContext>

        {casos.length === 0 && (
          <div className="flex items-center justify-center h-16 rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400">
            Sem casos
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 pb-2">
        <button className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-200">
          <Plus className="w-3.5 h-3.5" />
          Adicionar caso
        </button>
      </div>
    </div>
  )
}
