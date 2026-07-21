'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkflowSelector } from './WorkflowSelector'
import { CrmKanbanBoard } from './CrmKanbanBoard'
import { CasoModal } from './CasoModal'
import { CasoForm } from './CasoForm'
import { useCrmUiStore } from '../stores/casos.store'
import { useCases } from '../hooks/useCases'
import { useCreateCase, useUpdateCase } from '../hooks/useCaseMutations'
import { WORKFLOWS } from '@/data/mock'
import type { CaseInput } from '@/schemas/case.schema'

export function CrmWorkboard() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('wf-negociacao')
  const [editModalOpen, setEditModalOpen] = useState(false)

  const { modalOpen, selectedCaseId, closeModal, createModalOpen, openCreateModal, closeCreateModal } =
    useCrmUiStore()

  const { data: cases = [] } = useCases(selectedWorkflowId)
  const selectedCase = selectedCaseId ? cases.find((c) => c.id === selectedCaseId) ?? null : null
  const selectedWorkflow = WORKFLOWS.find((w) => w.id === selectedWorkflowId)

  const createCase = useCreateCase(selectedWorkflowId)
  const updateCase = useUpdateCase(selectedCaseId ?? '', selectedWorkflowId)

  async function handleCreateSubmit(data: CaseInput) {
    await createCase.mutateAsync(data)
    closeCreateModal()
  }

  async function handleEditSubmit(data: CaseInput) {
    await updateCase.mutateAsync(data)
    setEditModalOpen(false)
  }

  function handleEditOpen() {
    setEditModalOpen(true)
  }

  if (!selectedWorkflow) return null

  const workflowCounts: Record<string, number> = {
    [selectedWorkflowId]: cases.length,
  }

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
          counts={workflowCounts}
          onChange={setSelectedWorkflowId}
        />

        {/* Right: new case button */}
        <Button size="sm" className="flex-shrink-0" onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Caso
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden px-6 pt-5 pb-0">
        <CrmKanbanBoard workflow={selectedWorkflow} />
      </div>

      {/* Case Detail Modal */}
      {selectedCase && (
        <CasoModal
          caso={selectedCase}
          open={modalOpen && !editModalOpen}
          onClose={closeModal}
          onEdit={handleEditOpen}
        />
      )}

      {/* Edit Case Form */}
      {selectedCase && (
        <CasoForm
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => {}}
          editingCase={selectedCase}
          onSubmit={handleEditSubmit}
          isLoading={updateCase.isPending}
        />
      )}

      {/* Create Case Form */}
      <CasoForm
        open={createModalOpen}
        onClose={closeCreateModal}
        onSuccess={() => {}}
        defaultValues={{
          workflow_id: selectedWorkflowId,
          column_id: selectedWorkflow.colunas[0]?.id ?? '',
          tags: [],
        }}
        onSubmit={handleCreateSubmit}
        isLoading={createCase.isPending}
      />
    </div>
  )
}
