'use client'

import { CalendarRange, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MOVEMENT_CATEGORIES, MOVEMENT_CATEGORY_ORDER } from '../utils/categories'
import {
  countActiveMovementFilters,
  defaultMovementFilters,
  hasActiveMovementFilters,
  toggleCategory,
  type MovementFilters,
} from '../utils/movementFilters'

const ALL = '__all__'

/** Chip de alternância. Mesma forma visual para as categorias e para os dois
 * recortes da fila, porque fazem a mesma coisa: ligam e desligam um filtro. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

interface MovimentacoesFilterBarProps {
  filters: MovementFilters
  onChange: (filters: MovementFilters) => void
  courts: string[]
  /** Total do servidor que casa o filtro. */
  resultCount?: number
}

export function MovimentacoesFilterBar({
  filters,
  onChange,
  courts,
  resultCount,
}: MovimentacoesFilterBarProps) {
  const active = hasActiveMovementFilters(filters)

  function set<K extends keyof MovementFilters>(key: K, value: MovementFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b bg-card px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
            placeholder="Buscar no texto do ato ou pelo CNJ"
            className="h-9 pl-8 text-sm"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set('search', '')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* O período é SEMPRE limitado: sem recorte a primeira consulta
            varreria a tabela inteira, por isso não há como esvaziá-lo. */}
        <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-transparent pl-2.5 pr-2.5 dark:bg-input/30">
          <CalendarRange aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Período:</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(event) => event.target.value && set('from', event.target.value)}
            aria-label="Período de"
            className="w-[118px] bg-transparent text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(event) => event.target.value && set('to', event.target.value)}
            aria-label="Período até"
            className="w-[118px] bg-transparent text-xs text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>

        <Select
          value={filters.court ?? ALL}
          onValueChange={(value) => set('court', value === ALL ? null : value)}
        >
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue>{filters.court ?? 'Todos os tribunais'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tribunais</SelectItem>
            {courts.map((court) => (
              <SelectItem key={court} value={court}>
                {court}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterChip
          active={filters.requiresAction}
          onClick={() => set('requiresAction', !filters.requiresAction)}
        >
          Pede providência
        </FilterChip>

        <FilterChip
          active={filters.onlyUnhandled}
          onClick={() => set('onlyUnhandled', !filters.onlyUnhandled)}
        >
          Não tratadas
        </FilterChip>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(defaultMovementFilters())}
            className="h-9 text-muted-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Limpar ({countActiveMovementFilters(filters)})
          </Button>
        )}

        {typeof resultCount === 'number' && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {resultCount} movimentaç{resultCount === 1 ? 'ão' : 'ões'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {MOVEMENT_CATEGORY_ORDER.map((category) => {
          const meta = MOVEMENT_CATEGORIES[category]
          const Icon = meta.icon
          return (
            <FilterChip
              key={category}
              active={filters.categories.includes(category)}
              onClick={() => onChange(toggleCategory(filters, category))}
            >
              <Icon aria-hidden className="h-3 w-3" />
              {meta.label}
            </FilterChip>
          )
        })}
      </div>
    </div>
  )
}
