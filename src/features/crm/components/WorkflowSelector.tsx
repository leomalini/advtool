'use client'

import { cn } from '@/lib/utils'
import { WORKFLOWS } from '@/data/mock'
import type { Caso } from '@/data/mock'

interface WorkflowSelectorProps {
  selectedId: string
  casos: Caso[]
  onChange: (id: string) => void
}

export function WorkflowSelector({ selectedId, casos, onChange }: WorkflowSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
      {WORKFLOWS.map((wf) => {
        const count = casos.filter((c) => c.workflowId === wf.id).length
        const isActive = selectedId === wf.id

        return (
          <button
            key={wf.id}
            onClick={() => onChange(wf.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 hover:bg-white/60'
            )}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: wf.cor }}
            />
            <span>{wf.nome}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'bg-zinc-200 text-zinc-500'
              )}
              style={isActive ? { backgroundColor: wf.cor } : {}}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
