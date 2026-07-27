'use client'

import { ArrowRightLeft, Tag, Trash2, UserPlus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ProfileOption } from '@/components/shared/ProfileOption'
import { ETIQUETAS } from '@/data/mock'
import type { EtiquetaId } from '@/data/mock'
import { useProfiles } from '@/hooks/useProfiles'
import { useWorkflows } from '../hooks/useWorkflows'

interface CrmBulkActionBarProps {
  count: number
  /** Singular label for the selected entity, e.g. "caso" or "processo". */
  itemLabel: string
  /** Workflow currently being viewed — its columns are shown inline, other workflows as a submenu. */
  currentWorkflowId: string
  onMoveColumn: (targetWorkflowId: string, columnId: string) => void
  onAssign: (profileId: string) => void
  onAddTag: (tagId: EtiquetaId) => void
  onDelete: () => void
}

/** Shared bulk-action bar for CRM/Processos table views — keeps both in sync automatically. */
export function CrmBulkActionBar({
  count,
  itemLabel,
  currentWorkflowId,
  onMoveColumn,
  onAssign,
  onAddTag,
  onDelete,
}: CrmBulkActionBarProps) {
  const { data: workflows = [] } = useWorkflows()
  const { data: profiles = [] } = useProfiles()

  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-accent/60 border-b border-accent">
      <span className="text-xs font-semibold text-accent-foreground">
        {count} {itemLabel}
        {count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}
      </span>
      <div className="w-px h-4 bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Mover etapa
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[190px]">
          {workflows.map((wf, i) => (
            <div key={wf.id}>
              {i > 0 && <DropdownMenuSeparator />}
              {wf.id === currentWorkflowId ? (
                <>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: wf.cor }} />
                    {wf.nome}
                  </div>
                  {wf.colunas.map((coluna) => (
                    <DropdownMenuItem key={coluna.id} onClick={() => onMoveColumn(wf.id, coluna.id)}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coluna.cor }} />
                      {coluna.nome}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: wf.cor }} />
                    {wf.nome}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {wf.colunas.map((coluna) => (
                      <DropdownMenuItem key={coluna.id} onClick={() => onMoveColumn(wf.id, coluna.id)}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: coluna.cor }} />
                        {coluna.nome}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
          <UserPlus className="w-3.5 h-3.5" />
          Atribuir
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[220px]">
          {profiles.map((profile) => (
            <DropdownMenuItem key={profile.id} onClick={() => onAssign(profile.id)} className="py-1.5">
              <ProfileOption profile={profile} />
            </DropdownMenuItem>
          ))}
          {profiles.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Nenhum responsável cadastrado.
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11.5px] font-medium text-foreground/80 hover:bg-accent/60 transition-colors">
          <Tag className="w-3.5 h-3.5" />
          Etiqueta
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {Object.values(ETIQUETAS).map((et) => (
            <DropdownMenuItem key={et.id} onClick={() => onAddTag(et.id)}>
              {et.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={onDelete}
        className="ml-auto flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-destructive/30 text-[11.5px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Excluir
      </button>
    </div>
  )
}
