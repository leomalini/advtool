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
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { FINANCIAL_TYPE_LABELS, type FinancialEntryType } from '@/types/financialEntry.types'
import {
  hasActiveFinancialFilters,
  countActiveFinancialFilters,
  emptyFinancialFilters,
  type FinancialFilters,
  type FinancialStatusFilter,
} from '../utils/filterFinancialEntries'

const ALL = '__all__'
const TYPES = Object.keys(FINANCIAL_TYPE_LABELS) as FinancialEntryType[]

const STATUS_LABELS: Record<FinancialStatusFilter, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  atrasado: 'Atrasado',
}
const STATUSES = Object.keys(STATUS_LABELS) as FinancialStatusFilter[]

interface FinanceiroFilterBarProps {
  filters: FinancialFilters
  onChange: (filters: FinancialFilters) => void
  resultCount?: number
}

export function FinanceiroFilterBar({
  filters,
  onChange,
  resultCount,
}: FinanceiroFilterBarProps) {
  const active = hasActiveFinancialFilters(filters)

  function set<K extends keyof FinancialFilters>(key: K, value: FinancialFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Busca */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Buscar por descrição, cliente ou CNJ..."
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

        {/* Tipo */}
        <Select
          value={filters.type ?? ALL}
          onValueChange={(v) => set('type', v === ALL ? null : (v as FinancialEntryType))}
        >
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue>
              {filters.type ? FINANCIAL_TYPE_LABELS[filters.type] : 'Receita e despesa'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Receita e despesa</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FINANCIAL_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Situação */}
        <Select
          value={filters.status ?? ALL}
          onValueChange={(v) => set('status', v === ALL ? null : (v as FinancialStatusFilter))}
        >
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue>
              {filters.status ? STATUS_LABELS[filters.status] : 'Toda situação'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda situação</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(emptyFinancialFilters)}
            className="h-9 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Limpar ({countActiveFinancialFilters(filters)})
          </Button>
        )}

        {active && typeof resultCount === 'number' && (
          <span className="text-xs text-muted-foreground ml-auto">
            {resultCount} lançamento{resultCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Segunda linha: vínculos e período — campos mais largos, separados para
          a barra não virar uma parede numa tela estreita. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-[240px]">
          <ClienteCombobox
            value={filters.clientId}
            onChange={(id) => set('clientId', id)}
            placeholder="Todos os clientes"
            className="py-1.5"
          />
        </div>

        <div className="w-[280px]">
          <ProcessoCombobox
            value={filters.legalProcessId}
            onChange={(id) => set('legalProcessId', id)}
            placeholder="Todos os processos"
            className="py-1.5"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Vencimento</span>
          <Input
            type="date"
            value={filters.dueFrom ?? ''}
            onChange={(e) => set('dueFrom', e.target.value || null)}
            className="h-9 w-[150px] text-sm"
            aria-label="Vencimento de"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={filters.dueTo ?? ''}
            onChange={(e) => set('dueTo', e.target.value || null)}
            className="h-9 w-[150px] text-sm"
            aria-label="Vencimento até"
          />
        </div>
      </div>
    </div>
  )
}
