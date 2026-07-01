'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CasoCard } from './CasoCard'
import type { Caso } from '@/data/mock'

interface SortableCasoCardProps {
  caso: Caso
  onClick: () => void
}

export function SortableCasoCard({ caso, onClick }: SortableCasoCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: caso.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CasoCard caso={caso} onClick={onClick} />
    </div>
  )
}
