'use client'

import { Search, X, CalendarRange } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import { CRM_LEGAL_AREAS } from '@/schemas/crmItem.schema'
import type { CrmLegalArea } from '@/schemas/crmItem.schema'
import { useProfiles } from '@/hooks/useProfiles'
import { ProfileOption, ProfileOptionCompact } from '@/components/shared/ProfileOption'
import {
  hasActiveProcessoFilters,
  countActiveProcessoFilters,
  emptyProcessoFilters,
  type ProcessoFilters,
} from '../utils/filterLegalProcesses'
import type { Workflow } from '@/types/workflow.types'

const ALL = '__all__'

interface ProcessoFilterBarProps {
  workflow: Workflow
  filters: ProcessoFilters
  onChange: (filters: ProcessoFilters) => void
  /** Number of processos matching the current filters (for the results hint). */
  resultCount?: number
}

export function ProcessoFilterBar({ workflow, filters, onChange, resultCount }: ProcessoFilterBarProps) {
  const { data: profiles = [] } = useProfiles()
  const active = hasActiveProcessoFilters(filters)

  function set<K extends keyof ProcessoFilters>(key: K, value: ProcessoFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Buscar por título, CNJ, cliente, partes..."
          className="pl-8 h-9 text-sm"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => set('search', '')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar busca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Área jurídica */}
      <Select
        value={filters.legalArea ?? ALL}
        onValueChange={(v) => set('legalArea', v === ALL ? null : (v as CrmLegalArea))}
      >
        <SelectTrigger className="h-9 w-[150px] text-sm">
          <SelectValue>
            {(v: string) =>
              !v || v === ALL ? 'Todas as áreas' : AREAS_JURIDICAS[v as CrmLegalArea]?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as áreas</SelectItem>
          {CRM_LEGAL_AREAS.map((a) => (
            <SelectItem key={a} value={a}>
              {AREAS_JURIDICAS[a].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Responsável */}
      <Select
        value={filters.assignedTo ?? ALL}
        onValueChange={(v) => set('assignedTo', v === ALL ? null : v)}
      >
        <SelectTrigger className="h-9 w-[190px] text-sm">
          <SelectValue>
            {(v: string) => {
              if (!v || v === ALL) return 'Todos responsáveis'
              const profile = profiles.find((p) => p.id === v)
              return profile ? <ProfileOptionCompact profile={profile} /> : 'Responsável'
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos responsáveis</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <ProfileOption profile={p} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Etapa */}
      <Select
        value={filters.columnId ?? ALL}
        onValueChange={(v) => set('columnId', v === ALL ? null : v)}
      >
        <SelectTrigger className="h-9 w-[160px] text-sm">
          <SelectValue>
            {(v: string) => {
              if (!v || v === ALL) return 'Todas as etapas'
              return workflow.colunas.find((c) => c.id === v)?.nome ?? 'Etapa'
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as etapas</SelectItem>
          {workflow.colunas.map((coluna) => (
            <SelectItem key={coluna.id} value={coluna.id}>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: coluna.cor }} />
                {coluna.nome}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Prazo (de / até) */}
      <div className="flex items-center gap-1.5 h-9 pl-2.5 pr-1.5 rounded-md border border-input bg-transparent dark:bg-input/30">
        <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground shrink-0">Prazo:</span>
        <input
          type="date"
          value={filters.deadlineFrom ?? ''}
          onChange={(e) => set('deadlineFrom', e.target.value || null)}
          aria-label="Prazo de"
          className="w-[118px] bg-transparent text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <input
          type="date"
          value={filters.deadlineTo ?? ''}
          onChange={(e) => set('deadlineTo', e.target.value || null)}
          aria-label="Prazo até"
          className="w-[118px] bg-transparent text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
        />
        {(filters.deadlineFrom || filters.deadlineTo) && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, deadlineFrom: null, deadlineTo: null })}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Limpar prazo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(emptyProcessoFilters)}
          className="h-9 text-muted-foreground"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Limpar ({countActiveProcessoFilters(filters)})
        </Button>
      )}

      {active && typeof resultCount === 'number' && (
        <span className={cn('text-xs text-muted-foreground ml-auto')}>
          {resultCount} resultado{resultCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}
