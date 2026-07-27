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
import { CrmBulkActionBar } from './CrmBulkActionBar'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import type { AreaJuridica, EtiquetaId } from '@/data/mock'
import { getInitials } from '@/utils/profile'
import { useBulkUpdateCrmItems, useBulkDeleteCrmItems } from '../hooks/useCrmItemMutations'
import { crmItemKeys } from '../hooks/useCrmItems'
import { useColumnPrefs, type ColumnConfig } from '@/hooks/useColumnPrefs'
import { formatPrazo, formatRelativeDate } from '../utils/prazo'
import type { CrmItemWithRelations } from '@/types/crmItem.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { Workflow } from '@/types/workflow.types'

const CHECKBOX_COL_WIDTH = 38
const MENU_COL_WIDTH = 38

const CRM_TABLE_COLUMNS: ColumnConfig[] = [
  { key: 'caso', label: 'Caso / Cliente', defaultWidth: 260, minWidth: 180 },
  { key: 'area', label: 'Área', defaultWidth: 108, minWidth: 80 },
  { key: 'etapa', label: 'Etapa', defaultWidth: 158, minWidth: 110 },
  { key: 'responsavel', label: 'Responsável', defaultWidth: 148, minWidth: 110 },
  { key: 'prazo', label: 'Prazo', defaultWidth: 118, minWidth: 90 },
  { key: 'etiquetas', label: 'Etiquetas', defaultWidth: 170, minWidth: 110 },
  { key: 'atualizacao', label: 'Atual.', defaultWidth: 100, minWidth: 70 },
]

const COLUMN_STORAGE_KEY = 'advtool.crm-table-columns.v1'

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

interface CrmTableViewProps {
  workflow: Workflow
  cases: CrmItemWithRelations[]
  onRowClick: (caso: CrmItemWithRelations) => void
}

export function CrmTableView({ workflow, cases, onRowClick }: CrmTableViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  const bulkUpdate = useBulkUpdateCrmItems(workflow.id)
  const bulkDelete = useBulkDeleteCrmItems(workflow.id)
  const queryClient = useQueryClient()

  const { visible, widths, toggleVisible, setWidth, resetPrefs } = useColumnPrefs(
    COLUMN_STORAGE_KEY,
    CRM_TABLE_COLUMNS
  )
  const visibleColumns = CRM_TABLE_COLUMNS.filter((c) => visible[c.key])
  const gridTemplateColumns = [
    `${CHECKBOX_COL_WIDTH}px`,
    ...visibleColumns.map((c) => `${widths[c.key]}px`),
    `${MENU_COL_WIDTH}px`,
  ].join(' ')

  const sortedCases = useMemo(() => {
    if (!sortDir) return cases
    return [...cases].sort((a, b) => {
      const aTime = a.next_deadline ? new Date(a.next_deadline).getTime() : Infinity
      const bTime = b.next_deadline ? new Date(b.next_deadline).getTime() : Infinity
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime
    })
  }, [cases, sortDir])

  const allVisibleSelected = sortedCases.length > 0 && sortedCases.every((c) => selected.has(c.id))
  const selectedIds = Array.from(selected)

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sortedCases.map((c) => c.id)))
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
    const byId = new Map(cases.map((c) => [c.id, c]))
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

  function handleDelete() {
    if (!confirm(`Excluir ${selectedIds.length} caso(s)? Esta ação não pode ser desfeita.`)) return
    bulkDelete.mutate(selectedIds, { onSuccess: clearSelection })
  }

  function handleDeleteOne(id: string) {
    if (!confirm('Excluir este caso? Esta ação não pode ser desfeita.')) return
    bulkDelete.mutate([id])
  }

  function renderCell(colKey: string, caso: CrmItemWithRelations) {
    switch (colKey) {
      case 'caso': {
        return (
          <div className="min-w-0 pr-2">
            <div className="text-[13px] font-semibold text-foreground truncate">
              {getCrmItemClientName(caso)}
            </div>
            {caso.legal_process?.cnj_number ? (
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
                {caso.legal_process.cnj_number}
              </div>
            ) : caso.next_task_summary ? (
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {caso.next_task_summary}
              </div>
            ) : null}
          </div>
        )
      }
      case 'area': {
        const legalArea = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
        return legalArea ? (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', legalArea.bg, legalArea.color)}>
            {legalArea.label}
          </span>
        ) : null
      }
      case 'etapa': {
        const coluna = workflow.colunas.find((c) => c.id === caso.column_id)
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
        const assignedName = caso.assigned_profile?.full_name ?? ''
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
        const prazoInfo = caso.next_deadline ? formatPrazo(caso.next_deadline) : null
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
      case 'etiquetas': {
        const tags = caso.tags as EtiquetaId[]
        return (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 2).map((tagId) => {
              const et = ETIQUETAS[tagId]
              if (!et) return null
              return (
                <span key={tagId} className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold', et.color, et.textColor)}>
                  {et.label}
                </span>
              )
            })}
            {tags.length > 2 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-muted text-muted-foreground">
                +{tags.length - 2}
              </span>
            )}
          </div>
        )
      }
      case 'atualizacao': {
        return <div className="text-[11px] text-muted-foreground">{formatRelativeDate(caso.updated_at)}</div>
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
          itemLabel="caso"
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
            {CRM_TABLE_COLUMNS.map((col) => (
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

        {sortedCases.map((caso) => {
          const isSelected = selected.has(caso.id)
          const prazoInfo = caso.next_deadline ? formatPrazo(caso.next_deadline) : null
          const isCritical = prazoInfo?.tone === 'critical'

          return (
            <div
              key={caso.id}
              className={cn(
                'grid items-center px-4 min-h-[52px] border-b border-border/70 transition-colors cursor-pointer',
                isSelected && 'bg-accent/50',
                !isSelected && isCritical && 'bg-destructive/[0.04]',
                !isSelected && !isCritical && 'hover:bg-muted/40'
              )}
              style={{ gridTemplateColumns }}
              onClick={() => onRowClick(caso)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(caso.id)} />
              </div>

              {visibleColumns.map((col) => (
                <div key={col.key}>{renderCell(col.key, caso)}</div>
              ))}

              <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Ellipsis className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRowClick(caso)}>Abrir caso</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => handleDeleteOne(caso.id)}>
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}

        {sortedCases.length === 0 && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Nenhum caso nesta visualização.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center px-6 py-2 border-t border-border bg-card text-[11.5px] text-muted-foreground shrink-0">
        {cases.length} caso{cases.length !== 1 ? 's' : ''}
        {selected.size > 0 && <> · {selected.size} selecionado{selected.size > 1 ? 's' : ''}</>}
      </div>
    </div>
  )
}
