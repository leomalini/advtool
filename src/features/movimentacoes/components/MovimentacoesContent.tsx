'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/shared/Pagination'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useListPagination } from '@/hooks/useListPagination'
import { usePermissions } from '@/hooks/usePermissions'
import { useSearchParamsMirror } from '@/hooks/useSearchParamsMirror'
import { useCreateTask } from '@/features/tarefas/hooks/useTaskMutations'
import {
  STALE_MOVEMENT_DAYS,
  type LegalProcessMovementWithContext,
} from '@/types/legalProcess.types'
import {
  useActionRequiredMovementCount,
  useDailyActivity,
  useMovementCourts,
  useMovements,
  usePrefetchMovements,
  useProcessSilence,
  useSetMovementHandled,
  useSetMovementVisibility,
} from '../hooks/useMovements'
import { MOVEMENT_GROUPS, type MovementGroup } from '../utils/categories'
import {
  isoDaysAgo,
  isoToday,
  withoutQueueFilters,
  type MovementFilters,
} from '../utils/movementFilters'
import { parseMovementFilters, serializeMovementFilters } from '../utils/movementFiltersUrl'
import { MovimentacaoRow } from './MovimentacaoRow'
import { MovimentacoesFilterBar } from './MovimentacoesFilterBar'
import { MovimentacoesPulso, type PulseWindow } from './MovimentacoesPulso'
import { ProcessosEmSilencio } from './ProcessosEmSilencio'

const ITEM_LABEL = { singular: 'movimentação', plural: 'movimentações' }

export function MovimentacoesContent() {
  const { can, isLoading: loadingPermissions } = usePermissions()
  const searchParams = useSearchParams()

  // Os filtros partem da URL uma vez, ao montar; daí em diante a URL só os
  // espelha (useSearchParamsMirror).
  const [filters, setFilters] = useState<MovementFilters>(() => parseMovementFilters(searchParams))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  /**
   * A janela do Pulso é INDEPENDENTE do período da lista.
   *
   * Clicar numa coluna recorta a lista para aquele dia — se o gráfico usasse o
   * mesmo estado, ele encolheria para um dia junto e a pessoa perderia
   * exatamente o contexto que a fez clicar.
   */
  const [pulseWindow, setPulseWindow] = useState<PulseWindow>('30')

  const debouncedSearch = useDebounce(filters.search, 300)

  const queryFilters = useMemo<MovementFilters>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  )

  const listRef = useRef<HTMLDivElement>(null)

  /**
   * Quando o recorte muda, a página volta ao início (dentro de
   * `useListPagination`) e a linha aberta e o foco do teclado também.
   *
   * Ajuste DURANTE O RENDER, e não num efeito — é o padrão que a doc do React
   * indica para "adaptar estado quando um valor muda" ("You Might Not Need an
   * Effect"). Num `useEffect` isto dispara render em cascata, e o
   * `react-hooks/set-state-in-effect` reprova.
   */
  const filtersKey = JSON.stringify(queryFilters)
  const [lastFiltersKey, setLastFiltersKey] = useState(filtersKey)
  if (lastFiltersKey !== filtersKey) {
    setLastFiltersKey(filtersKey)
    setExpandedId(null)
    setFocusedIndex(0)
  }

  const pagination = useListPagination({
    listKey: 'movimentacoes',
    resetKey: filtersKey,
    scrollContainerRef: listRef,
  })
  const { pageIndex, pageSize } = pagination

  const pulseFrom = isoDaysAgo(Number(pulseWindow) - 1)
  const pulseTo = isoToday()

  const movements = useMovements(queryFilters, pageIndex, pageSize)
  pagination.clampToTotal(movements.isPlaceholderData ? undefined : movements.data?.total)
  const prefetchMovements = usePrefetchMovements()

  useSearchParamsMirror({ ...serializeMovementFilters(filters), ...pagination.urlParams })
  const activity = useDailyActivity(pulseFrom, pulseTo)
  const silence = useProcessSilence()
  const { data: courts = [] } = useMovementCourts()
  // A mesma consulta do badge do menu, então vem do cache já quente.
  const actionRequired = useActionRequiredMovementCount({ enabled: true })

  /** Parado além da fronteira da pendência `stale_movements`, ou nunca
   * movimentado — `days_since` nulo é o caso mais grave, não o mais leve. */
  const stalled = useMemo(() => {
    if (!silence.data) return null
    return silence.data.filter(
      (row) => row.days_since === null || row.days_since > STALE_MOVEMENT_DAYS,
    ).length
  }, [silence.data])

  const setHandled = useSetMovementHandled()
  const setVisibility = useSetMovementVisibility()
  const createTask = useCreateTask()

  const rows = movements.data?.rows ?? []
  const total = movements.data?.total ?? 0
  const isMutating = setHandled.isPending || setVisibility.isPending

  const canUpdate = can('processos', 'update')
  const canCreateTask = can('tarefas', 'create')

  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  const registerRef = useCallback(
    (index: number) => (element: HTMLButtonElement | null) => {
      rowRefs.current[index] = element
    },
    [],
  )

  function handleToggleHandled(movimentacao: LegalProcessMovementWithContext) {
    setHandled.mutate({ id: movimentacao.id, handled: !movimentacao.handled_at })
  }

  function handleToggleVisibility(movimentacao: LegalProcessMovementWithContext) {
    setVisibility.mutate({
      id: movimentacao.id,
      hidden: !movimentacao.hidden_from_client,
    })
  }

  function handleCreateTask(movimentacao: LegalProcessMovementWithContext, title: string) {
    if (!title) return
    createTask.mutate({ title, legal_process_id: movimentacao.legal_process_id })
  }

  /** Outra página: a linha aberta e o foco do teclado eram da anterior. */
  function handlePageChange(index: number) {
    pagination.setPageIndex(index)
    setExpandedId(null)
    setFocusedIndex(0)
  }

  /** Clique na coluna do pulso: recorta a lista para aquele dia. */
  function handleSelectDay(day: string) {
    setFilters((current) => ({ ...current, from: day, to: day }))
  }

  /** Clique na legenda: liga ou desliga as categorias daquela faixa. */
  function handleSelectGroup(group: MovementGroup) {
    const groupCategories = MOVEMENT_GROUPS[group].categories
    setFilters((current) => {
      const allOn = groupCategories.every((category) => current.categories.includes(category))
      const categories = allOn
        ? current.categories.filter((category) => !groupCategories.includes(category))
        : [...new Set([...current.categories, ...groupCategories])]
      return { ...current, categories }
    })
  }

  /**
   * Navegação por teclado espelhando a fila de Publicações — mas sem sair da
   * tela, porque aqui não existe detalhe: `j`/`k` movem o foco, `e` trata e
   * desce.
   *
   * O listener fica no contêiner da lista e não no documento: os botões de
   * linha estão dentro dele, e o evento sobe. Assim o atalho não vaza para
   * outras telas nem para o campo de busca.
   */
  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return

    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const step = event.key === 'j' ? 1 : event.key === 'k' ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      const next = Math.min(Math.max(focusedIndex + step, 0), rows.length - 1)
      rowRefs.current[next]?.focus()
      return
    }

    if (event.key === 'e' && canUpdate) {
      const movimentacao = rows[focusedIndex]
      if (!movimentacao || movimentacao.handled_at) return
      event.preventDefault()
      setHandled.mutate(
        { id: movimentacao.id, handled: true },
        { onSuccess: () => rowRefs.current[Math.min(focusedIndex + 1, rows.length - 1)]?.focus() },
      )
    }
  }

  const queueFiltered = queryFilters.requiresAction || queryFilters.onlyUnhandled

  return (
    <div className="-m-6 flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-card px-6 py-3.5">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Movimentações</h1>
            <p className="text-xs text-muted-foreground">
              Andamentos dos processos monitorados, classificados pelo que cada ato é
            </p>
          </div>
          <span className="hidden text-[11px] text-muted-foreground/70 md:block">
            <kbd className="rounded border px-1">j</kbd> /{' '}
            <kbd className="rounded border px-1">k</kbd> navega ·{' '}
            <kbd className="rounded border px-1">e</kbd> trata
          </span>
        </div>

        <MovimentacoesPulso
          data={activity.data ?? []}
          isLoading={activity.isLoading}
          isError={activity.isError}
          window={pulseWindow}
          onWindowChange={setPulseWindow}
          onSelectDay={handleSelectDay}
          onSelectGroup={handleSelectGroup}
          actionRequired={actionRequired.data ?? null}
          stalled={stalled}
        />

        <MovimentacoesFilterBar
          filters={filters}
          onChange={setFilters}
          courts={courts}
          resultCount={movements.isSuccess ? total : undefined}
        />

        {/* O listener fica aqui e não no documento: os botões de linha estão
            dentro, o evento sobe, e o atalho não vaza para outras telas. */}
        <div ref={listRef} className="flex-1 overflow-y-auto" onKeyDown={handleListKeyDown}>
          {movements.isError && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <Activity className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as movimentações.
              </p>
              <Button size="sm" variant="outline" onClick={() => movements.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}

          {!movements.isError && movements.isLoading && (
            <div className="space-y-2 p-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          )}

          {!movements.isError && !movements.isLoading && rows.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <Activity className="h-7 w-7 text-muted-foreground" />
              {/* Nunca um vazio ambíguo: um período sem nada que peça
                  providência, ou sem nada por tratar, não é o mesmo que um
                  período sem movimentação nenhuma. */}
              {queueFiltered ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {queryFilters.requiresAction
                      ? 'Nenhuma movimentação pedindo providência no período.'
                      : 'Nenhuma movimentação por tratar no período.'}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFilters(withoutQueueFilters(filters))}
                  >
                    Ver todas as movimentações do período
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma movimentação no período.
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Os andamentos chegam pelo monitoramento dos processos na BuscaProcessos e
                    pela sincronização na tela do processo. Processo sem monitoramento ativo não
                    recebe aviso de ato novo.
                  </p>
                </>
              )}
            </div>
          )}

          {!movements.isError && rows.length > 0 && (
            <ul className={cn('divide-y divide-border', movements.isFetching && 'opacity-60')}>
              {rows.map((movimentacao, index) => (
                <MovimentacaoRow
                  key={movimentacao.id}
                  movimentacao={movimentacao}
                  expanded={expandedId === movimentacao.id}
                  onToggle={() =>
                    setExpandedId(expandedId === movimentacao.id ? null : movimentacao.id)
                  }
                  onFocus={() => setFocusedIndex(index)}
                  registerRef={registerRef(index)}
                  onToggleHandled={handleToggleHandled}
                  onToggleVisibility={handleToggleVisibility}
                  onCreateTask={handleCreateTask}
                  canUpdate={canUpdate && !loadingPermissions}
                  canCreateTask={canCreateTask && !loadingPermissions}
                  isMutating={isMutating}
                />
              ))}
            </ul>
          )}
        </div>

        {movements.isSuccess && total > 0 && (
          <Pagination
            pageIndex={pageIndex}
            pageSize={pageSize}
            total={total}
            itemLabel={ITEM_LABEL}
            onPageChange={handlePageChange}
            onPageSizeChange={pagination.setPageSize}
            onPrefetchPage={(index) => prefetchMovements(queryFilters, index, pageSize)}
          />
        )}
      </div>

      <ProcessosEmSilencio
        rows={silence.data ?? []}
        isLoading={silence.isLoading}
        isError={silence.isError}
      />
    </div>
  )
}
