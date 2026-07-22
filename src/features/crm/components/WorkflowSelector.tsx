'use client'

import { cn } from '@/lib/utils'
import { useWorkflows } from '../hooks/useWorkflows'

interface WorkflowSelectorProps {
  selectedId: string
  /** Count per workflow_id — only the selected one needs to be accurate */
  counts?: Record<string, number>
  onChange: (id: string) => void
  /** @deprecated pass counts instead */
  casos?: never
}

export function WorkflowSelector({ selectedId, counts = {}, onChange }: WorkflowSelectorProps) {
  const { data: workflows = [] } = useWorkflows()

  return (
    <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
      {workflows.map((wf) => {
        const count = counts[wf.id] ?? 0
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
