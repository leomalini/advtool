'use client'

import { Search, X } from 'lucide-react'
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
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import { CRM_LEGAL_AREAS, CRM_TAGS } from '@/schemas/crmItem.schema'
import type { CrmLegalArea, CrmTag } from '@/schemas/crmItem.schema'
import { useProfiles } from '@/hooks/useProfiles'
import { hasActiveFilters, countActiveFilters, type CrmFilters } from '../utils/filterCases'

const ALL = '__all__'

interface CrmFilterBarProps {
  filters: CrmFilters
  onChange: (filters: CrmFilters) => void
  /** Number of cases matching the current filters (for the results hint). */
  resultCount?: number
}

export function CrmFilterBar({ filters, onChange, resultCount }: CrmFilterBarProps) {
  const { data: profiles = [] } = useProfiles()
  const active = hasActiveFilters(filters)

  function set<K extends keyof CrmFilters>(key: K, value: CrmFilters[K]) {
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
        <SelectTrigger className="h-9 w-[160px] text-sm">
          <SelectValue>
            {(v: string) =>
              !v || v === ALL
                ? 'Todos responsáveis'
                : profiles.find((p) => p.id === v)?.full_name ?? 'Responsável'
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos responsáveis</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Etiqueta */}
      <Select
        value={filters.tag ?? ALL}
        onValueChange={(v) => set('tag', v === ALL ? null : (v as CrmTag))}
      >
        <SelectTrigger className="h-9 w-[150px] text-sm">
          <SelectValue>
            {(v: string) =>
              !v || v === ALL ? 'Todas etiquetas' : ETIQUETAS[v as CrmTag]?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas etiquetas</SelectItem>
          {CRM_TAGS.map((t) => (
            <SelectItem key={t} value={t}>
              {ETIQUETAS[t].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ search: '', legalArea: null, assignedTo: null, tag: null })}
          className="h-9 text-muted-foreground"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Limpar ({countActiveFilters(filters)})
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
