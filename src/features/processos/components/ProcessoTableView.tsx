'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUp,
  ArrowUpDown,
  Clock,
  Ellipsis,
  Tag,
  Trash2,
  TriangleAlert,
  UserPlus,
  ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import type { AreaJuridica, EtiquetaId } from '@/data/mock'
import { useProfiles } from '@/hooks/useProfiles'
import { useBulkUpdateCrmItems } from '@/features/crm/hooks/useCrmItemMutations'
import { useDeleteLegalProcess } from '../hooks/useLegalProcessMutations'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import type { Workflow } from '@/types/workflow.types'

const GRID_COLS =
  '38px minmax(210px,1.6fr) 150px 108px 158px 148px minmax(150px,1fr) 84px 38px'

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

interface ProcessoTableViewProps {
  workflow: Workflow
  processos: LegalProcessWithRelations[]
  onRowClick: (processo: LegalProcessWithRelations) => void
}

export function ProcessoTableView({ workflow, processos, onRowClick }: ProcessoTableViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  const { data: profiles = [] } = useProfiles()
  const bulkUpdate = useBulkUpdateCrmItems(workflow.id)
  const deleteProcess = useDeleteLegalProcess()

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

  function handleMoveColumn(columnId: string) {
    bulkUpdate.mutate(
      { ids: selectedIds, getInput: () => ({ column_id: columnId }) },
      { onSuccess: clearSelection }
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

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-accent/60 border-b border-accent">
          <span className="text-xs font-semibold text-accent-foreground">
            {selected.size} processo{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
          </span>
          <div className="w-px h-4 bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Mover etapa
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {workflow.colunas.map((coluna) => (
                <DropdownMenuItem key={coluna.id} onClick={() => handleMoveColumn(coluna.id)}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coluna.cor }} />
                  {coluna.nome}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
              <UserPlus className="w-3.5 h-3.5" />
              Atribuir
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {profiles.map((profile) => (
                <DropdownMenuItem key={profile.id} onClick={() => handleAssign(profile.id)}>
                  {profile.full_name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
              <Tag className="w-3.5 h-3.5" />
              Etiqueta
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.values(ETIQUETAS).map((et) => (
                <DropdownMenuItem key={et.id} onClick={() => handleAddTag(et.id)}>
                  {et.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={handleDelete}
            className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-destructive/30 text-[11.5px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div
          className="grid items-center px-4 h-9 border-b border-border bg-muted/40 sticky top-0 z-10"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground pr-2">
            Cliente / CNJ
          </div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Tribunal / Vara</div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Área</div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa</div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</div>
          <button
            className={cn(
              'flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide',
              sortDir ? 'text-accent-foreground' : 'text-muted-foreground'
            )}
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            Prazo
            {sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
            {sortDir === 'desc' && <ArrowUp className="w-3 h-3 rotate-180" />}
            {!sortDir && <ArrowUpDown className="w-3 h-3 opacity-40" />}
          </button>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Atual.</div>
          <div />
        </div>

        {sorted.map((processo) => {
          const item = processo.crm_item
          const legalArea = item.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
          const coluna = workflow.colunas.find((c) => c.id === item.column_id)
          const prazoInfo = item.next_deadline ? formatPrazo(item.next_deadline) : null
          const assignedName = item.assigned_profile?.full_name ?? ''
          const isSelected = selected.has(item.id)
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
              style={{ gridTemplateColumns: GRID_COLS }}
              onClick={() => onRowClick(processo)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(item.id)} />
              </div>

              <div className="min-w-0 pr-2">
                <div className="text-[13px] font-semibold text-foreground truncate">
                  {getCrmItemClientName(item)}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
                  {processo.cnj_number ?? 'Sem CNJ cadastrado'}
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs text-foreground/80 truncate">{processo.court ?? '—'}</p>
                {processo.court_division && (
                  <p className="text-[10.5px] text-muted-foreground truncate">{processo.court_division}</p>
                )}
              </div>

              <div>
                {legalArea && (
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', legalArea.bg, legalArea.color)}>
                    {legalArea.label}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-foreground/80 min-w-0">
                {coluna && (
                  <>
                    <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: coluna.cor }} />
                    <span className="truncate">{coluna.nome}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                {assignedName && (
                  <div className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-[9.5px] font-bold bg-accent text-accent-foreground">
                    {getInitials(assignedName)}
                  </div>
                )}
                <span className="text-xs text-foreground/80 truncate">{assignedName || '—'}</span>
              </div>

              <div>
                {prazoInfo ? (
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
                )}
              </div>

              <div className="text-[11px] text-muted-foreground">
                {formatRelativeDate(item.updated_at)}
              </div>

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
