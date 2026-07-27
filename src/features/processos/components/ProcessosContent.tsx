'use client'

import { useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
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

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // A URL é a fonte da verdade para qual processo está aberto (ou se o form de criação
  // está aberto) — assim um link para /processos?id=X funciona tanto vindo de outra
  // página quanto a partir da própria tela de Processos.
  const selectedId = searchParams.get('id')
  const createOpen = searchParams.get('create') === '1'
  const deepLinkClientId = searchParams.get('clientId')
  const [editOpen, setEditOpen] = useState(false)

  function openDetail(id: string) {
    setEditOpen(false)
    router.push(`${pathname}?id=${id}`)
  }

  function closeDetail() {
    setEditOpen(false)
    router.replace(pathname)
  }

  function openCreate() {
    router.push(`${pathname}?create=1`)
  }

  function closeCreate() {
    router.replace(pathname)
  }

  const { data: selectedProcesso } = useLegalProcess(selectedId ?? '')

  const createProcess = useCreateLegalProcess()
  const updateProcess = useUpdateLegalProcess(selectedId ?? '', selectedProcesso?.crm_item.id ?? '')

  async function handleCreateSubmit(data: LegalProcessInput) {
    await createProcess.mutateAsync(data)
    closeCreate()
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
        <Button size="sm" onClick={openCreate}>
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
              onRowClick={(p) => openDetail(p.id)}
            />
          )}
        </div>

        <div className="w-[320px] shrink-0 hidden lg:block">
          <MovimentacoesFeed onSelectProcess={openDetail} />
        </div>
      </div>

      {/* Detail modal */}
      {selectedProcesso && (
        <ProcessoModal
          processo={selectedProcesso}
          open={!!selectedId && !editOpen}
          onClose={closeDetail}
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
        onClose={closeCreate}
        defaultValues={{
          column_id: workflow.colunas[0]?.id ?? '',
          client_id: deepLinkClientId ?? undefined,
          tags: [],
        }}
        onSubmit={handleCreateSubmit}
        isLoading={createProcess.isPending}
      />
    </div>
  )
}
