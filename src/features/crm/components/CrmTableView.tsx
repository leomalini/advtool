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
import { useBulkUpdateCases, useBulkDeleteCases } from '../hooks/useCaseMutations'
import { formatPrazo, formatRelativeDate } from '../utils/prazo'
import type { CaseWithRelations } from '@/types/case.types'
import { getCaseClientName } from '@/types/case.types'
import type { Workflow } from '@/types/workflow.types'

const GRID_COLS =
  '38px minmax(210px,1.6fr) 108px 158px 148px 118px minmax(150px,1fr) 84px 38px'

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

interface CrmTableViewProps {
  workflow: Workflow
  cases: CaseWithRelations[]
  onRowClick: (caso: CaseWithRelations) => void
}

export function CrmTableView({ workflow, cases, onRowClick }: CrmTableViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  const { data: profiles = [] } = useProfiles()
  const bulkUpdate = useBulkUpdateCases(workflow.id)
  const bulkDelete = useBulkDeleteCases(workflow.id)

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

  return (
    <div className="flex flex-col h-full">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-accent/60 border-b border-accent">
          <span className="text-xs font-semibold text-accent-foreground">
            {selected.size} caso{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
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
            Caso / Cliente
          </div>
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
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas</div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Atual.</div>
          <div />
        </div>

        {sortedCases.map((caso) => {
          const legalArea = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
          const coluna = workflow.colunas.find((c) => c.id === caso.column_id)
          const tags = caso.tags as EtiquetaId[]
          const prazoInfo = caso.next_deadline ? formatPrazo(caso.next_deadline) : null
          const assignedName = caso.assigned_profile?.full_name ?? ''
          const isSelected = selected.has(caso.id)
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
              style={{ gridTemplateColumns: GRID_COLS }}
              onClick={() => onRowClick(caso)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(caso.id)} />
              </div>

              <div className="min-w-0 pr-2">
                <div className="text-[13px] font-semibold text-foreground truncate">
                  {getCaseClientName(caso)}
                </div>
                {caso.cnj_number ? (
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5 truncate">
                    {caso.cnj_number}
                  </div>
                ) : caso.next_task_summary ? (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {caso.next_task_summary}
                  </div>
                ) : null}
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

              <div className="text-[11px] text-muted-foreground">
                {formatRelativeDate(caso.updated_at)}
              </div>

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
