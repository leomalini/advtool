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
  FINANCIAL_SITUATION_FILTER_LABELS,
  type FinancialFilters,
  type FinancialSituationFilter,
} from '../utils/filterFinancialEntries'

const ALL = '__all__'
const TYPES = Object.keys(FINANCIAL_TYPE_LABELS) as FinancialEntryType[]

/** Ordem deliberada: o guarda-chuva primeiro, depois os três buckets que o
 * compõem, e "Pago" por último — a mesma leitura dos cards de indicador. */
const SITUATIONS: FinancialSituationFilter[] = [
  'a_receber',
  'a_vencer',
  'vencido',
  'condicao_especial',
  'pago',
]

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
          value={filters.situation ?? ALL}
          onValueChange={(v) =>
            set('situation', v === ALL ? null : (v as FinancialSituationFilter))
          }
        >
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue>
              {filters.situation
                ? FINANCIAL_SITUATION_FILTER_LABELS[filters.situation]
                : 'Toda situação'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toda situação</SelectItem>
            {SITUATIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {FINANCIAL_SITUATION_FILTER_LABELS[s]}
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

        {/* Período e "sem data" são mutuamente exclusivos: um intervalo não tem
            como conter a ausência de data, então marcar um desliga o outro.
            "Período", e não "Vencimento": o pago entra pela data do pagamento,
            o mesmo critério do gráfico (getCashFlowDate). */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs text-muted-foreground cursor-help"
            title="Pagos entram pela data do pagamento; os demais, pelo vencimento — o mesmo critério do gráfico."
          >
            Período
          </span>
          <Input
            type="date"
            value={filters.periodFrom ?? ''}
            onChange={(e) =>
              onChange({ ...filters, periodFrom: e.target.value || null, undatedOnly: false })
            }
            disabled={filters.undatedOnly}
            className="h-9 w-[150px] text-sm"
            aria-label="Período de"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={filters.periodTo ?? ''}
            onChange={(e) =>
              onChange({ ...filters, periodTo: e.target.value || null, undatedOnly: false })
            }
            disabled={filters.undatedOnly}
            className="h-9 w-[150px] text-sm"
            aria-label="Período até"
          />
        </div>

        {filters.undatedOnly && (
          <button
            type="button"
            onClick={() => set('undatedOnly', false)}
            className="flex items-center gap-1 h-9 px-2.5 rounded-md border border-info/30 bg-info/5 text-xs text-info"
          >
            Sem data definida
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
