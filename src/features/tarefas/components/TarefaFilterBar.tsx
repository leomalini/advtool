'use client'

import { Search, X, AlertTriangle } from 'lucide-react'
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
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@/types/task.types'
import { useProfiles } from '@/hooks/useProfiles'
import { ProfileOption, ProfileOptionCompact } from '@/components/shared/ProfileOption'
import {
  hasActiveTaskFilters,
  countActiveTaskFilters,
  emptyTaskFilters,
  type TaskFilters,
} from '../utils/filterTasks'

const ALL = '__all__'
const PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]

interface TarefaFilterBarProps {
  filters: TaskFilters
  onChange: (filters: TaskFilters) => void
  /** Number of tasks matching the current filters (for the results hint). */
  resultCount?: number
}

export function TarefaFilterBar({ filters, onChange, resultCount }: TarefaFilterBarProps) {
  const { data: profiles = [] } = useProfiles()
  const active = hasActiveTaskFilters(filters)

  function set<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  // Radix's SelectValue renders the selected item's own children by default;
  // the trigger needs a shorter label than the dropdown option.
  const assignedProfile = filters.assignedTo
    ? profiles.find((p) => p.id === filters.assignedTo)
    : undefined
  const assignedLabel = !filters.assignedTo ? (
    'Todos responsáveis'
  ) : assignedProfile ? (
    <ProfileOptionCompact profile={assignedProfile} />
  ) : (
    'Responsável'
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Busca */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Buscar por título, descrição, responsável..."
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

      {/* Prioridade */}
      <Select
        value={filters.priority ?? ALL}
        onValueChange={(v) => set('priority', v === ALL ? null : (v as TaskPriority))}
      >
        <SelectTrigger className="h-9 w-[150px] text-sm">
          <SelectValue>
            {filters.priority ? TASK_PRIORITY_LABELS[filters.priority] : 'Toda prioridade'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toda prioridade</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
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

      {/* Atrasadas — toggle, o filtro mais usado no dia a dia */}
      <Button
        variant={filters.overdueOnly ? 'default' : 'outline'}
        size="lg"
        onClick={() => set('overdueOnly', !filters.overdueOnly)}
        className={cn('h-9 text-sm', filters.overdueOnly && 'bg-destructive hover:bg-destructive/90')}
      >
        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
        Atrasadas
      </Button>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(emptyTaskFilters)}
          className="h-9 text-muted-foreground"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Limpar ({countActiveTaskFilters(filters)})
        </Button>
      )}

      {active && typeof resultCount === 'number' && (
        <span className="text-xs text-muted-foreground ml-auto">
          {resultCount} resultado{resultCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}
