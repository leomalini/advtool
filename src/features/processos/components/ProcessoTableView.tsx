'use client'

import { useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowUp,
  ArrowUpDown,
  Clock,
  Ellipsis,
  Loader2,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { CrmBulkActionBar } from '@/features/crm/components/CrmBulkActionBar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DeletionImpactNotice } from '@/components/shared/DeletionImpactNotice'
import { Pagination } from '@/components/shared/Pagination'
import { useLegalProcessDeletionImpact } from '../hooks/useLegalProcesses'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { getInitials } from '@/utils/profile'
import { useBulkUpdateCrmItems } from '@/features/crm/hooks/useCrmItemMutations'
import { crmItemKeys } from '@/features/crm/hooks/useCrmItems'
import { useDeleteLegalProcess, useInvalidateLegalProcesses } from '../hooks/useLegalProcessMutations'
import { useColumnPrefs, type ColumnConfig } from '@/hooks/useColumnPrefs'
import type { ListPagination } from '@/hooks/useListPagination'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import type { LegalProcessListRow } from '@/types/legalProcess.types'
import type { Workflow } from '@/types/workflow.types'
import type { LegalProcessSelectionEntry } from '../services/legalProcesses.service'
import type { ProcessoSort, ProcessoSortField } from '../utils/processoListUrl'
import { Can } from '@/components/shared/Can'

const CHECKBOX_COL_WIDTH = 38
const MENU_COL_WIDTH = 38
const ITEM_LABEL = { singular: 'processo', plural: 'processos' }

const PROCESSO_COLUMNS: ColumnConfig[] = [
  { key: 'cliente', label: 'Cliente / CNJ', defaultWidth: 240, minWidth: 180 },
  { key: 'tribunal', label: 'Tribunal / Vara', defaultWidth: 150, minWidth: 110 },
  { key: 'area', label: 'Área', defaultWidth: 108, minWidth: 80 },
  { key: 'etapa', label: 'Etapa', defaultWidth: 158, minWidth: 110 },
  { key: 'responsavel', label: 'Responsável', defaultWidth: 148, minWidth: 110 },
  { key: 'prazo', label: 'Prazo', defaultWidth: 118, minWidth: 90 },
  { key: 'atualizacao', label: 'Atual.', defaultWidth: 100, minWidth: 70 },
]

const COLUMN_STORAGE_KEY = 'advtool.processos-table-columns.v1'

/** O cliente do card mestre como a tabela sempre mostrou (o nome de exibição
 * de `getCrmItemClientName`); `null` sem cliente vinculado — ou um que a RLS
 * não deixa ver, como o embed de antes. */
function clientDisplayName(row: LegalProcessListRow): string | null {
  if (!row.client_type) return null
  if (row.client_type === 'individual') return row.client_name ?? '(sem nome)'
  return row.client_trade_name ?? row.client_company_name ?? '(sem nome)'
}

interface ResizeHandleProps {
  startWidth: number
  minWidth: number
  onChange: (width: number) => void
}

function ResizeHandle({ startWidth, minWidth, onChange }: ResizeHandleProps) {
  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX

    function handleMove(ev: PointerEvent) {
      onChange(Math.max(startWidth + (ev.clientX - startX), minWidth))
    }
    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none hover:bg-accent-foreground/30 active:bg-accent-foreground/50 z-10"
    />
  )
}

interface ProcessoTableViewProps {
  workflow: Workflow
  /** A página atual — não a lista inteira (docs/paginacao.md). */
  rows: LegalProcessListRow[]
  /** Total do filtro, não da página. */
  total: number
  /** A página anterior ainda na tela enquanto a nova carrega. */
  isStale: boolean
  sort: ProcessoSort | null
  onSortChange: (sort: ProcessoSort) => void
  onRowClick: (processoId: string) => void
  pagination: ListPagination
  onPrefetchPage: (index: number) => void
  /** Todos os processos do filtro com card, para "Selecionar todos". */
  onLoadAllSelection: () => Promise<LegalProcessSelectionEntry[]>
  /** O contêiner que rola: volta ao topo a cada troca de página. */
  scrollRef: RefObject<HTMLDivElement | null>
}

/**
 * A tabela de Processos. A seleção sobrevive à troca de página (as ações em
 * massa agem em tudo o que foi marcado, de qualquer página); um filtro novo
 * remonta a tabela — quem a usa passa o filtro como `key` —, e a seleção
 * recomeça, para nenhuma ação cair em processos que já não estão na tela.
 */
export function ProcessoTableView({
  workflow,
  rows,
  total,
  isStale,
  sort,
  onSortChange,
  onRowClick,
  pagination,
  onPrefetchPage,
  onLoadAllSelection,
  scrollRef,
}: ProcessoTableViewProps) {
  /** crm_item → processo: as ações em massa agem no card, a exclusão no processo. */
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  /** Quantos o "Selecionar todos" trouxe — enquanto a seleção for exatamente
   * essa, o aviso diz que o filtro inteiro está marcado. */
  const [allMatchingCount, setAllMatchingCount] = useState<number | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<
    { mode: 'bulk' } | { mode: 'one'; processoId: string } | null
  >(null)

  const bulkUpdate = useBulkUpdateCrmItems(workflow.id)
  const deleteProcess = useDeleteLegalProcess()
  const { data: deletionImpact, isLoading: loadingImpact } = useLegalProcessDeletionImpact(
    pendingDelete?.mode === 'one' ? pendingDelete.processoId : null
  )
  const invalidateLegalProcesses = useInvalidateLegalProcesses()
  const queryClient = useQueryClient()

  const { visible, widths, toggleVisible, setWidth, resetPrefs } = useColumnPrefs(
    COLUMN_STORAGE_KEY,
    PROCESSO_COLUMNS
  )
  const visibleColumns = PROCESSO_COLUMNS.filter((c) => visible[c.key])
  const gridTemplateColumns = [
    `${CHECKBOX_COL_WIDTH}px`,
    ...visibleColumns.map((c) => `${widths[c.key]}px`),
    `${MENU_COL_WIDTH}px`,
  ].join(' ')

  function toggleSort(field: ProcessoSortField) {
    onSortChange(
      sort?.field === field
        ? { field, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' }
    )
  }

  // Bulk actions operate on crm_items, so a processo with no linked item can't
  // take part in the selection — it stays visible but not selectable.
  const pageSelectable = rows.flatMap((row) =>
    row.crm_item_id ? [[row.crm_item_id, row.id] as const] : []
  )
  const allPageSelected =
    pageSelectable.length > 0 && pageSelectable.every(([crmItemId]) => selected.has(crmItemId))
  const allMatchingSelected = allMatchingCount !== null && selected.size === allMatchingCount
  const selectedIds = Array.from(selected.keys())

  /** Sempre a partir do estado mais recente: dois cliques seguidos, antes de
   * um render, não podem se sobrescrever. */
  function updateSelection(update: (previous: Map<string, string>) => Map<string, string>) {
    setSelected((previous) => update(new Map(previous)))
    setAllMatchingCount(null)
  }

  /** O cabeçalho age só na página: marca o que falta nela, ou desmarca a
   * página inteira — o que foi marcado em outras páginas fica. */
  function toggleAll() {
    updateSelection((next) => {
      if (allPageSelected) pageSelectable.forEach(([crmItemId]) => next.delete(crmItemId))
      else pageSelectable.forEach(([crmItemId, processoId]) => next.set(crmItemId, processoId))
      return next
    })
  }

  function toggleOne(crmItemId: string, processoId: string) {
    updateSelection((next) => {
      if (next.has(crmItemId)) next.delete(crmItemId)
      else next.set(crmItemId, processoId)
      return next
    })
  }

  function clearSelection() {
    updateSelection(() => new Map())
  }

  async function selectAllMatching() {
    setLoadingAll(true)
    try {
      const entries = await onLoadAllSelection()
      setSelected(new Map(entries.map((entry) => [entry.crmItemId, entry.processoId])))
      setAllMatchingCount(entries.length)
    } catch {
      toast.error('Não foi possível selecionar todos os processos do filtro.')
    } finally {
      setLoadingAll(false)
    }
  }

  function handleMoveColumn(targetWorkflowId: string, columnId: string) {
    const crossWorkflow = targetWorkflowId !== workflow.id
    const input = crossWorkflow
      ? { workflow_id: targetWorkflowId, column_id: columnId, position: 0 }
      : { column_id: columnId }
    bulkUpdate.mutate(
      { ids: selectedIds, getInput: () => input },
      {
        onSuccess: () => {
          if (crossWorkflow) {
            queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow(targetWorkflowId) })
          }
          invalidateLegalProcesses()
          clearSelection()
        },
      }
    )
  }

  function handleAssign(profileId: string) {
    bulkUpdate.mutate(
      { ids: selectedIds, getInput: () => ({ assigned_to: profileId }) },
      {
        onSuccess: () => {
          invalidateLegalProcesses()
          clearSelection()
        },
      }
    )
  }

  function handleDelete() {
    setPendingDelete({ mode: 'bulk' })
  }

  function handleDeleteOne(processoId: string) {
    setPendingDelete({ mode: 'one', processoId })
  }

  function confirmPendingDelete() {
    if (!pendingDelete) return
    if (pendingDelete.mode === 'bulk') {
      Promise.all(
        Array.from(selected.values()).map((processoId) => deleteProcess.mutateAsync(processoId))
      ).then(() => {
        clearSelection()
        setPendingDelete(null)
      })
    } else {
      deleteProcess.mutate(pendingDelete.processoId, { onSuccess: () => setPendingDelete(null) })
    }
  }

  function renderCell(colKey: string, row: LegalProcessListRow) {
    // Tribunal reads only from the processo row itself, so it renders even
    // when no crm_item is linked.
    if (colKey === 'tribunal') {
      return (
        <div className="min-w-0">
          <p className="text-xs text-foreground/80 truncate">{row.court ?? '—'}</p>
          {row.court_division && (
            <p className="text-[10.5px] text-muted-foreground truncate">{row.court_division}</p>
          )}
        </div>
      )
    }

    // Every other column comes from the crm_item — flag the anomaly in the
    // identifying column and blank the rest, instead of throwing.
    if (!row.crm_item_id) {
      if (colKey === 'cliente') {
        return (
          <div className="min-w-0 pr-2">
            <div
              className={cn(
                'truncate font-semibold text-foreground',
                row.cnj_number ? 'font-mono text-[12px]' : 'text-[13px]',
              )}
            >
              {row.cnj_number ?? 'Sem CNJ cadastrado'}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground truncate">
              <TriangleAlert className="w-3 h-3 shrink-0" />
              Sem caso vinculado
            </div>
          </div>
        )
      }
      return <span className="text-[11.5px] text-muted-foreground">—</span>
    }

    switch (colKey) {
      case 'cliente': {
        // O processo identifica a linha: CNJ, ou o título do card quando não
        // há número. O cliente desce para a linha de apoio e é omitido quando
        // não existe — antes o destaque era dele, e um processo sem cliente
        // aparecia como '(sem cliente)' em negrito.
        const clienteVinculado = clientDisplayName(row)
        const titulo = row.title?.trim() || null
        // Sem CNJ o título sobe para o destaque; nesse caso ele não se repete
        // embaixo.
        const apoio = [row.cnj_number ? titulo : null, clienteVinculado]
          .filter(Boolean)
          .join(' · ')

        return (
          <div className="min-w-0 pr-2">
            <div
              className={cn(
                'truncate font-semibold text-foreground',
                row.cnj_number ? 'font-mono text-[12px]' : 'text-[13px]',
              )}
            >
              {row.cnj_number ?? titulo ?? 'Sem CNJ cadastrado'}
            </div>
            {apoio && (
              <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{apoio}</div>
            )}
          </div>
        )
      }
      case 'area': {
        const legalArea = row.legal_area ? AREAS_JURIDICAS[row.legal_area as AreaJuridica] : null
        return legalArea ? (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', legalArea.bg, legalArea.color)}>
            {legalArea.label}
          </span>
        ) : null
      }
      case 'etapa': {
        const coluna = workflow.colunas.find((c) => c.id === row.column_id)
        return (
          <div className="flex items-center gap-1.5 text-xs text-foreground/80 min-w-0">
            {coluna && (
              <>
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: coluna.cor }} />
                <span className="truncate">{coluna.nome}</span>
              </>
            )}
          </div>
        )
      }
      case 'responsavel': {
        const assignedName = row.assigned_name ?? ''
        return (
          <div className="flex items-center gap-2 min-w-0">
            {assignedName && (
              <div className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-[9.5px] font-bold bg-accent text-accent-foreground">
                {getInitials(assignedName)}
              </div>
            )}
            <span className="text-xs text-foreground/80 truncate">{assignedName || '—'}</span>
          </div>
        )
      }
      case 'prazo': {
        const prazoInfo = row.next_deadline ? formatPrazo(row.next_deadline) : null
        return prazoInfo ? (
          <span
            className={cn(
              'flex items-center gap-1 text-[11.5px]',
              prazoInfo.tone === 'critical' && 'text-destructive font-semibold animate-pulse-urgent',
              prazoInfo.tone === 'warning' && 'text-warning font-medium',
              prazoInfo.tone === 'neutral' && 'text-foreground/80'
            )}
          >
            {prazoInfo.tone === 'critical' ? (
              <TriangleAlert className="w-3 h-3 shrink-0" />
            ) : (
              <Clock className="w-3 h-3 shrink-0" />
            )}
            {prazoInfo.label}
          </span>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">—</span>
        )
      }
      case 'atualizacao': {
        return (
          <div className="text-[11px] text-muted-foreground">
            {formatRelativeDate(row.crm_updated_at ?? row.updated_at)}
          </div>
        )
      }
      default:
        return null
    }
  }

  // O aviso do "selecionar todos" só faz sentido com mais de uma página.
  const hasMorePages = total > rows.length

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <CrmBulkActionBar
          count={selected.size}
          itemLabel="processo"
          currentWorkflowId={workflow.id}
          onMoveColumn={handleMoveColumn}
          onAssign={handleAssign}
          onDelete={handleDelete}
        />
      )}

      {/* Column settings toolbar */}
      <div className="flex items-center justify-end px-4 py-1.5 border-b border-border bg-card shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-[11.5px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Colunas
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[190px]">
            {PROCESSO_COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visible[col.key]}
                onCheckedChange={() => toggleVisible(col.key)}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={resetPrefs}>Restaurar padrão</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* "Selecionar todos": a página inteira marcada abre a opção do filtro
          inteiro, como no Gmail. */}
      {hasMorePages && (allPageSelected || allMatchingSelected) && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-border bg-accent/40 px-4 py-1.5 text-[11.5px] text-foreground/80 shrink-0">
          {allMatchingSelected ? (
            <>
              <span>
                Todos os <strong>{selected.size}</strong> processos do filtro estão selecionados.
              </span>
              <button type="button" onClick={clearSelection} className="font-medium text-primary hover:underline">
                Limpar seleção
              </button>
            </>
          ) : (
            <>
              <span>
                Os <strong>{pageSelectable.length}</strong> processos desta página estão
                selecionados.
              </span>
              <button
                type="button"
                onClick={selectAllMatching}
                disabled={loadingAll}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
              >
                {loadingAll && <Loader2 className="h-3 w-3 animate-spin" />}
                Selecionar todos os {total} processos do filtro
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div
          className="grid items-center px-4 h-9 border-b border-border bg-muted/40 sticky top-0 z-10"
          style={{ gridTemplateColumns }}
        >
          <Checkbox
            checked={allPageSelected}
            onCheckedChange={toggleAll}
            aria-label="Selecionar os processos desta página"
          />
          {visibleColumns.map((col) =>
            col.key === 'prazo' || col.key === 'atualizacao' ? (
              <button
                key={col.key}
                className={cn(
                  'relative flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide pr-2',
                  sort?.field === col.key ? 'text-accent-foreground' : 'text-muted-foreground'
                )}
                onClick={() => toggleSort(col.key as ProcessoSortField)}
              >
                {col.label}
                {sort?.field === col.key && sort.direction === 'asc' && <ArrowUp className="w-3 h-3" />}
                {sort?.field === col.key && sort.direction === 'desc' && <ArrowUp className="w-3 h-3 rotate-180" />}
                {sort?.field !== col.key && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                <ResizeHandle startWidth={widths[col.key]} minWidth={col.minWidth} onChange={(w) => setWidth(col.key, w)} />
              </button>
            ) : (
              <div
                key={col.key}
                className="relative text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground pr-2"
              >
                {col.label}
                <ResizeHandle startWidth={widths[col.key]} minWidth={col.minWidth} onChange={(w) => setWidth(col.key, w)} />
              </div>
            )
          )}
          <div />
        </div>

        <div className={cn('transition-opacity', isStale && 'opacity-60')}>
          {rows.map((row) => {
            const crmItemId = row.crm_item_id
            const isSelected = !!crmItemId && selected.has(crmItemId)
            const prazoInfo = row.next_deadline ? formatPrazo(row.next_deadline) : null
            const isCritical = prazoInfo?.tone === 'critical'

            return (
              <div
                key={row.id}
                className={cn(
                  'grid items-center px-4 min-h-[52px] border-b border-border/70 transition-colors cursor-pointer',
                  isSelected && 'bg-accent/50',
                  !isSelected && isCritical && 'bg-destructive/[0.04]',
                  !isSelected && !isCritical && 'hover:bg-muted/40'
                )}
                style={{ gridTemplateColumns }}
                onClick={() => onRowClick(row.id)}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  {crmItemId && (
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(crmItemId, row.id)} />
                  )}
                </div>

                {visibleColumns.map((col) => (
                  <div key={col.key}>{renderCell(col.key, row)}</div>
                ))}

                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Ellipsis className="w-4 h-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRowClick(row.id)}>Abrir processo</DropdownMenuItem>
                      <Can resource="processos" action="delete">
                        <DropdownMenuItem variant="destructive" onClick={() => handleDeleteOne(row.id)}>
                          Excluir
                        </DropdownMenuItem>
                      </Can>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>

        {rows.length === 0 && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Nenhum processo encontrado.
          </div>
        )}
      </div>

      {total > 0 && (
        <Pagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={total}
          itemLabel={ITEM_LABEL}
          onPageChange={pagination.setPageIndex}
          onPageSizeChange={pagination.setPageSize}
          onPrefetchPage={onPrefetchPage}
          summaryExtra={
            selected.size > 0
              ? `${selected.size} selecionado${selected.size > 1 ? 's' : ''}`
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete?.mode === 'bulk'
            ? `Excluir ${selected.size} processo${selected.size > 1 ? 's' : ''}?`
            : 'Excluir processo?'
        }
        description={
          pendingDelete?.mode === 'bulk'
            ? `Os ${selected.size} processos selecionados serão removidos permanentemente. Esta ação não pode ser desfeita.`
            : 'Este processo será removido permanentemente, junto com suas movimentações. Esta ação não pode ser desfeita.'
        }
        isLoading={deleteProcess.isPending}
        onConfirm={confirmPendingDelete}
      >
        {/* Only for a single processo: counting the impact of a bulk delete
            would be one query set per row. */}
        {pendingDelete?.mode === 'one' && (
          <DeletionImpactNotice impact={deletionImpact} isLoading={loadingImpact} />
        )}
      </ConfirmDialog>
    </div>
  )
}
