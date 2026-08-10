'use client'

import { useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { useLegalProcesses } from '../hooks/useLegalProcesses'
import { useCreateLegalProcess } from '../hooks/useLegalProcessMutations'
import { ProcessoTableView } from './ProcessoTableView'
import { ProcessoForm } from './ProcessoForm'
import { MovimentacoesFeed } from './MovimentacoesFeed'
import { ProcessoFilterBar } from './ProcessoFilterBar'
import {
  filterLegalProcesses,
  emptyProcessoFilters,
  type ProcessoFilters,
} from '../utils/filterLegalProcesses'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'

export function ProcessosContent() {
  const workflow = useWorkflow('wf-processos')
  const { data: processos = [], isLoading } = useLegalProcesses()
  const [filters, setFilters] = useState<ProcessoFilters>(emptyProcessoFilters)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const createOpen = searchParams.get('create') === '1'
  const deepLinkClientId = searchParams.get('clientId')

  function openDetail(processo: LegalProcessWithRelations) {
    router.push(`/processos/${processo.id}`)
  }

  function openDetailById(id: string) {
    router.push(`/processos/${id}`)
  }

  function openCreate() {
    router.push(`${pathname}?create=1`)
  }

  function closeCreate() {
    router.replace(pathname)
  }

  const createProcess = useCreateLegalProcess()

  async function handleCreateSubmit(data: LegalProcessInput) {
    await createProcess.mutateAsync(data)
    closeCreate()
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
        <ProcessoFilterBar
          workflow={workflow}
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
              onRowClick={openDetail}
            />
          )}
        </div>

        <div className="w-[320px] shrink-0 hidden lg:block">
          <MovimentacoesFeed onSelectProcess={openDetailById} />
        </div>
      </div>

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
