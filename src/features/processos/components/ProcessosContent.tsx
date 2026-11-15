'use client'

import { useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { useDebounce } from '@/hooks/useDebounce'
import { useListPagination } from '@/hooks/useListPagination'
import { useSearchParamsMirror } from '@/hooks/useSearchParamsMirror'
import {
  useFetchLegalProcessSelection,
  useLegalProcessPage,
  usePrefetchLegalProcessPage,
} from '../hooks/useLegalProcesses'
import {
  useCreateLegalProcess,
  type CreateProcessStep,
} from '../hooks/useLegalProcessMutations'
import { ProcessoTableView } from './ProcessoTableView'
import { ProcessoForm, type ProcessoFormSubmitMeta } from './ProcessoForm'
import { MovimentacoesFeed } from './MovimentacoesFeed'
import { ProcessoFilterBar } from './ProcessoFilterBar'
import type { ProcessoFilters } from '../utils/filterLegalProcesses'
import {
  parseProcessoFilters,
  parseProcessoSort,
  serializeProcessoListState,
  type ProcessoSort,
} from '../utils/processoListUrl'
import type { LegalProcessPageQuery } from '../services/legalProcesses.service'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import { Can } from '@/components/shared/Can'

export function ProcessosContent() {
  const workflow = useWorkflow('wf-processos')

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Filtros e ordem partem da URL uma vez, ao montar; daí em diante a URL só
  // os espelha (useSearchParamsMirror). A busca nunca vai para a URL.
  const [filters, setFilters] = useState<ProcessoFilters>(() => parseProcessoFilters(searchParams))
  const [sort, setSort] = useState<ProcessoSort | null>(() => parseProcessoSort(searchParams))
  const debouncedSearch = useDebounce(filters.search, 300)
  const queryFilters: ProcessoFilters = { ...filters, search: debouncedSearch.trim() }
  const scrollRef = useRef<HTMLDivElement>(null)

  // Paginada no servidor (docs/paginacao.md): busca, filtros, ordem e página
  // vão na consulta, e só a página atual chega.
  const listKey = JSON.stringify([queryFilters, sort])
  const pagination = useListPagination({
    listKey: 'processos',
    resetKey: listKey,
    scrollContainerRef: scrollRef,
  })
  const pageQuery: LegalProcessPageQuery = {
    filters: queryFilters,
    sort,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
  }
  const page = useLegalProcessPage(pageQuery)
  pagination.clampToTotal(page.isPlaceholderData ? undefined : page.data?.total)
  const prefetchPage = usePrefetchLegalProcessPage()
  const fetchSelection = useFetchLegalProcessSelection()

  // `create`, `clientId` e `cnj` (deep links do formulário) não são tocados.
  useSearchParamsMirror({ ...serializeProcessoListState(filters, sort), ...pagination.urlParams })

  const createOpen = searchParams.get('create') === '1'
  const deepLinkClientId = searchParams.get('clientId')
  // Vem da tela de publicações: publicação de processo não cadastrado abre o
  // formulário já com o número, e a consulta automática preenche o resto.
  const deepLinkCnj = searchParams.get('cnj')

  function openDetailById(id: string) {
    router.push(`/processos/${id}`)
  }

  /** Abrir e fechar o formulário mexe só em `create`: página e filtros, que o
   * espelho guarda na URL, continuam lá. */
  function setCreateParam(open: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    if (open) params.set('create', '1')
    else {
      params.delete('create')
      params.delete('clientId')
      params.delete('cnj')
    }
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  function openCreate() {
    router.push(setCreateParam(true))
  }

  function closeCreate() {
    router.replace(setCreateParam(false))
  }

  const createProcess = useCreateLegalProcess()
  /** Etapa em curso do cadastro — alimenta o painel de progresso do modal. */
  const [createStep, setCreateStep] = useState<CreateProcessStep | null>(null)

  async function handleCreateSubmit(data: LegalProcessInput, meta: ProcessoFormSubmitMeta) {
    try {
      await createProcess.mutateAsync({
        input: data,
        capaAlreadyFetched: meta.capaFetched,
        monitoringFrequency: meta.monitoringFrequency,
        onStep: setCreateStep,
      })
      closeCreate()
    } finally {
      // No `finally` para que uma falha não deixe o painel de progresso preso
      // por cima do formulário.
      setCreateStep(null)
    }
  }

  if (!workflow) return null

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
        <Can resource="processos" action="create">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Processo
          </Button>
        </Can>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b bg-card shrink-0">
        <ProcessoFilterBar
          workflow={workflow}
          filters={filters}
          onChange={setFilters}
          resultCount={page.isSuccess ? page.data.total : undefined}
        />
      </div>

      {/* Body: table + movements feed */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          {page.isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Carregando processos...
            </div>
          ) : page.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 h-full text-sm text-muted-foreground">
              Não foi possível carregar os processos.
              <Button size="sm" variant="outline" onClick={() => page.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : (
            // `key`: filtro ou ordem novos remontam a tabela, e a seleção
            // recomeça — nenhuma ação em massa cai em processo fora da tela.
            <ProcessoTableView
              key={listKey}
              workflow={workflow}
              rows={page.data?.rows ?? []}
              total={page.data?.total ?? 0}
              isStale={page.isPlaceholderData}
              sort={sort}
              onSortChange={setSort}
              onRowClick={openDetailById}
              pagination={pagination}
              onPrefetchPage={(index) => prefetchPage({ ...pageQuery, pageIndex: index })}
              onLoadAllSelection={() => fetchSelection(queryFilters)}
              scrollRef={scrollRef}
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
          cnj_number: deepLinkCnj ?? undefined,
          tags: [],
        }}
        onSubmit={handleCreateSubmit}
        isLoading={createProcess.isPending}
        createStep={createStep}
      />
    </div>
  )
}
