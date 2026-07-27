'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUp,
  ArrowUpDown,
  Clock,
  Ellipsis,
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
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica, EtiquetaId } from '@/data/mock'
import { getInitials } from '@/utils/profile'
import { useBulkUpdateCrmItems } from '@/features/crm/hooks/useCrmItemMutations'
import { crmItemKeys } from '@/features/crm/hooks/useCrmItems'
import { useDeleteLegalProcess } from '../hooks/useLegalProcessMutations'
import { useColumnPrefs, type ColumnConfig } from '@/hooks/useColumnPrefs'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import type { Workflow } from '@/types/workflow.types'

const CHECKBOX_COL_WIDTH = 38
const MENU_COL_WIDTH = 38

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
  processos: LegalProcessWithRelations[]
  onRowClick: (processo: LegalProcessWithRelations) => void
}

export function ProcessoTableView({ workflow, processos, onRowClick }: ProcessoTableViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  const bulkUpdate = useBulkUpdateCrmItems(workflow.id)
  const deleteProcess = useDeleteLegalProcess()
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

  const sorted = useMemo(() => {
    if (!sortDir) return processos
    return [...processos].sort((a, b) => {
      const aDeadline = a.crm_item.next_deadline
      const bDeadline = b.crm_item.next_deadline
      const aTime = aDeadline ? new Date(aDeadline).getTime() : Infinity
      const bTime = bDeadline ? new Date(bDeadline).getTime() : Infinity
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime
    })
  }, [processos, sortDir])

  const allVisibleSelected = sorted.length > 0 && sorted.every((p) => selected.has(p.crm_item.id))
  const selectedIds = Array.from(selected)

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map((p) => p.crm_item.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
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
          clearSelection()
        },
      }
    )
  }

  function handleAssign(profileId: string) {
    bulkUpdate.mutate(
      { ids: selectedIds, getInput: () => ({ assigned_to: profileId }) },
      { onSuccess: clearSelection }
    )
  }

  function handleAddTag(tagId: EtiquetaId) {
    const byId = new Map(processos.map((p) => [p.crm_item.id, p.crm_item]))
    bulkUpdate.mutate(
      {
        ids: selectedIds,
        getInput: (id) => {
          const current = (byId.get(id)?.tags ?? []) as EtiquetaId[]
          const tags = current.includes(tagId) ? current : [...current, tagId]
          return { tags }
        },
      },
      { onSuccess: clearSelection }
    )
  }

  const crmItemIdToProcessoId = new Map(processos.map((p) => [p.crm_item.id, p.id]))

  function handleDelete() {
    if (!confirm(`Excluir ${selectedIds.length} processo(s)? Esta ação não pode ser desfeita.`)) return
    Promise.all(
      selectedIds
        .map((crmItemId) => crmItemIdToProcessoId.get(crmItemId))
        .filter((id): id is string => !!id)
        .map((processoId) => deleteProcess.mutateAsync(processoId))
    ).then(clearSelection)
  }

  function handleDeleteOne(processoId: string) {
    if (!confirm('Excluir este processo? Esta ação não pode ser desfeita.')) return
    deleteProcess.mutate(processoId)
  }

  function renderCell(colKey: string, processo: LegalProcessWithRelations) {
    const item = processo.crm_item

    switch (colKey) {
      case 'cliente': {
        return (
          <div className="min-w-0 pr-2">
            <div className="text-[13px] font-semibold text-foreground truncate">
              {getCrmItemClientName(item)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
              {processo.cnj_number ?? 'Sem CNJ cadastrado'}
            </div>
          </div>
        )
      }
      case 'tribunal': {
        return (
          <div className="min-w-0">
            <p className="text-xs text-foreground/80 truncate">{processo.court ?? '—'}</p>
            {processo.court_division && (
              <p className="text-[10.5px] text-muted-foreground truncate">{processo.court_division}</p>
            )}
          </div>
        )
      }
      case 'area': {
        const legalArea = item.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
        return legalArea ? (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', legalArea.bg, legalArea.color)}>
            {legalArea.label}
          </span>
        ) : null
      }
      case 'etapa': {
        const coluna = workflow.colunas.find((c) => c.id === item.column_id)
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
        const assignedName = item.assigned_profile?.full_name ?? ''
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
        const prazoInfo = item.next_deadline ? formatPrazo(item.next_deadline) : null
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
        return <div className="text-[11px] text-muted-foreground">{formatRelativeDate(item.updated_at)}</div>
      }
      default:
        return null
    }
  }

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
          onAddTag={handleAddTag}
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

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid items-center px-4 h-9 border-b border-border bg-muted/40 sticky top-0 z-10"
          style={{ gridTemplateColumns }}
        >
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
          {visibleColumns.map((col) =>
            col.key === 'prazo' ? (
              <button
                key={col.key}
                className={cn(
                  'relative flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide pr-2',
                  sortDir ? 'text-accent-foreground' : 'text-muted-foreground'
                )}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                {col.label}
                {sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
                {sortDir === 'desc' && <ArrowUp className="w-3 h-3 rotate-180" />}
                {!sortDir && <ArrowUpDown className="w-3 h-3 opacity-40" />}
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

        {sorted.map((processo) => {
          const item = processo.crm_item
          const isSelected = selected.has(item.id)
          const prazoInfo = item.next_deadline ? formatPrazo(item.next_deadline) : null
          const isCritical = prazoInfo?.tone === 'critical'

          return (
            <div
              key={processo.id}
              className={cn(
                'grid items-center px-4 min-h-[52px] border-b border-border/70 transition-colors cursor-pointer',
                isSelected && 'bg-accent/50',
                !isSelected && isCritical && 'bg-destructive/[0.04]',
                !isSelected && !isCritical && 'hover:bg-muted/40'
              )}
              style={{ gridTemplateColumns }}
              onClick={() => onRowClick(processo)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(item.id)} />
              </div>

              {visibleColumns.map((col) => (
                <div key={col.key}>{renderCell(col.key, processo)}</div>
              ))}

              <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Ellipsis className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRowClick(processo)}>Abrir processo</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => handleDeleteOne(processo.id)}>
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Nenhum processo encontrado.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center px-6 py-2 border-t border-border bg-card text-[11.5px] text-muted-foreground shrink-0">
        {processos.length} processo{processos.length !== 1 ? 's' : ''}
        {selected.size > 0 && <> · {selected.size} selecionado{selected.size > 1 ? 's' : ''}</>}
      </div>
    </div>
  )
}
