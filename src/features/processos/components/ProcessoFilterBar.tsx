'use client'

import { Search, X, CalendarRange, Radar } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
import { personFilterValue, screenFilters } from '@/features/ia/context/screenContext'
import { useAssistantScreen } from '@/features/ia/hooks/useAssistantScreen'
import {
  hasActiveProcessoFilters,
  countActiveProcessoFilters,
  emptyProcessoFilters,
  MONITORING_SOURCES,
  MONITORING_SOURCE_LABELS,
  type MonitoringSource,
  type ProcessoFilters,
} from '../utils/filterLegalProcesses'
import type { Workflow } from '@/types/workflow.types'

const ALL = '__all__'

const MONITORING_SOURCE_HINTS: Record<MonitoringSource, string> = {
  oab: '"Não monitorado" no detalhe: chega pelo monitoramento das OABs do escritório',
  manual: 'Com frequência de monitoramento escolhida no detalhe do processo',
}

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

  // Na ordem de MONITORING_SOURCES, para o rótulo do Assistente não depender
  // da ordem dos cliques.
  function toggleMonitoring(source: MonitoringSource, checked: boolean) {
    const next = new Set(filters.monitoring)
    if (checked) next.add(source)
    else next.delete(source)
    set(
      'monitoring',
      MONITORING_SOURCES.filter((s) => next.has(s))
    )
  }

  // Radix's SelectValue renders the selected item's own children by default;
  // these triggers need a different (shorter) label than the dropdown option,
  // so the label is computed here and passed as SelectValue's children.
  const assignedProfile = filters.assignedTo
    ? profiles.find((p) => p.id === filters.assignedTo)
    : undefined

  // Os filtros visíveis vão para o painel do Assistente com a pergunta.
  useAssistantScreen({
    filters: screenFilters([
      ['Busca', filters.search.trim()],
      ['Área', filters.legalArea && AREAS_JURIDICAS[filters.legalArea]?.label],
      ['Responsável', personFilterValue(filters.assignedTo, assignedProfile?.full_name)],
      [
        'Etapa',
        filters.columnId && workflow.colunas.find((c) => c.id === filters.columnId)?.nome,
      ],
      ['Prazo a partir de', filters.deadlineFrom],
      ['Prazo até', filters.deadlineTo],
      [
        'Monitoramento',
        filters.monitoring.map((source) => MONITORING_SOURCE_LABELS[source]).join(' e '),
      ],
    ]),
  })
  const assignedLabel = !filters.assignedTo ? (
    'Todos responsáveis'
  ) : assignedProfile ? (
    <ProfileOptionCompact profile={assignedProfile} />
  ) : (
    'Responsável'
  )

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
            {filters.legalArea ? AREAS_JURIDICAS[filters.legalArea]?.label : 'Todas as áreas'}
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
          <SelectValue>{assignedLabel}</SelectValue>
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
            {filters.columnId
              ? (workflow.colunas.find((c) => c.id === filters.columnId)?.nome ?? 'Etapa')
              : 'Todas as etapas'}
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

      {/* Monitoramento — marcável, os dois ao mesmo tempo */}
      <div className="flex items-center gap-3 h-9 px-2.5 rounded-md border border-input bg-transparent dark:bg-input/30">
        <Radar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground shrink-0">Monitoramento:</span>
        {MONITORING_SOURCES.map((source) => (
          <div key={source} className="flex items-center gap-1.5" title={MONITORING_SOURCE_HINTS[source]}>
            <Checkbox
              id={`processo-monitoring-${source}`}
              checked={filters.monitoring.includes(source)}
              onCheckedChange={(checked) => toggleMonitoring(source, checked === true)}
            />
            <Label
              htmlFor={`processo-monitoring-${source}`}
              className="text-xs font-normal cursor-pointer"
            >
              {MONITORING_SOURCE_LABELS[source]}
            </Label>
          </div>
        ))}
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
