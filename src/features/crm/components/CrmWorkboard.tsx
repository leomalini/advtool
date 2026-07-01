'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkflowSelector } from './WorkflowSelector'
import { CrmKanbanBoard } from './CrmKanbanBoard'
import { CasoModal } from './CasoModal'
import { useCrmCasosStore } from '../stores/casos.store'
import { WORKFLOWS } from '@/data/mock'

export function CrmWorkboard() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('wf-negociacao')
  const { casos, modalOpen, selectedCasoId, closeModal } = useCrmCasosStore()

  const selectedWorkflow = WORKFLOWS.find((w) => w.id === selectedWorkflowId)
  const selectedCaso = selectedCasoId ? casos.find((c) => c.id === selectedCasoId) ?? null : null

  if (!selectedWorkflow) return null

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b bg-white flex-shrink-0 gap-4">
        {/* Left: workflow name */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: selectedWorkflow.cor }}
          />
          <h1 className="text-sm font-semibold text-zinc-900 truncate">
            {selectedWorkflow.nome}
          </h1>
          <span className="text-xs text-zinc-400 hidden sm:block">·</span>
          <span className="text-xs text-zinc-400 hidden sm:block">
            {selectedWorkflow.descricao}
          </span>
        </div>

        {/* Center: workflow selector */}
        <WorkflowSelector
          selectedId={selectedWorkflowId}
          casos={casos}
          onChange={setSelectedWorkflowId}
        />

        {/* Right: new case button */}
        <Button size="sm" className="flex-shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Caso
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden px-6 pt-5 pb-0">
        <CrmKanbanBoard workflow={selectedWorkflow} />
      </div>

      {/* Case Modal */}
      {selectedCaso && (
        <CasoModal
          caso={selectedCaso}
          open={modalOpen}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
