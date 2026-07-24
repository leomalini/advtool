'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { useLegalProcesses, useLegalProcess } from '../hooks/useLegalProcesses'
import { useCreateLegalProcess, useUpdateLegalProcess } from '../hooks/useLegalProcessMutations'
import { ProcessoTableView } from './ProcessoTableView'
import { ProcessoForm } from './ProcessoForm'
import { ProcessoModal } from './ProcessoModal'
import { MovimentacoesFeed } from './MovimentacoesFeed'
import { CrmFilterBar } from '@/features/crm/components/CrmFilterBar'
import {
  filterLegalProcesses,
  emptyProcessoFilters,
  type ProcessoFilters,
} from '../utils/filterLegalProcesses'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'

export function ProcessosContent() {
  const workflow = useWorkflow('wf-processos')
  const { data: processos = [], isLoading } = useLegalProcesses()
  const [filters, setFilters] = useState<ProcessoFilters>(emptyProcessoFilters)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: selectedProcesso } = useLegalProcess(selectedId ?? '')

  const createProcess = useCreateLegalProcess()
  const updateProcess = useUpdateLegalProcess(selectedId ?? '', selectedProcesso?.crm_item.id ?? '')

  async function handleCreateSubmit(data: LegalProcessInput) {
    await createProcess.mutateAsync(data)
    setCreateOpen(false)
  }

  async function handleEditSubmit(data: LegalProcessInput) {
    await updateProcess.mutateAsync(data)
    setEditOpen(false)
  }

  if (!workflow) return null

  const filtered = filterLegalProcesses(processos, filters)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b bg-card shrink-0 gap-4">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Processos</h1>
          <p className="text-xs text-muted-foreground">
            Todos os processos judiciais em andamento no escritório
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Processo
        </Button>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b bg-card shrink-0">
        <CrmFilterBar
          filters={filters}
          onChange={setFilters}
          resultCount={filtered.length}
        />
      </div>

      {/* Body: table + movements feed */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Carregando processos...
            </div>
          ) : (
            <ProcessoTableView
              workflow={workflow}
              processos={filtered}
              onRowClick={(p) => setSelectedId(p.id)}
            />
          )}
        </div>

        <div className="w-[320px] shrink-0 hidden lg:block">
          <MovimentacoesFeed onSelectProcess={setSelectedId} />
        </div>
      </div>

      {/* Detail modal */}
      {selectedProcesso && (
        <ProcessoModal
          processo={selectedProcesso}
          open={!!selectedId && !editOpen}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditOpen(true)}
        />
      )}

      {/* Edit form */}
      {selectedProcesso && (
        <ProcessoForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editingProcess={selectedProcesso}
          onSubmit={handleEditSubmit}
          isLoading={updateProcess.isPending}
        />
      )}

      {/* Create form */}
      <ProcessoForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultValues={{
          column_id: workflow.colunas[0]?.id ?? '',
          tags: [],
        }}
        onSubmit={handleCreateSubmit}
        isLoading={createProcess.isPending}
      />
    </div>
  )
}
