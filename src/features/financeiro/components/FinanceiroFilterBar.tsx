'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { screenFilters } from '@/features/ia/context/screenContext'
import { useAssistantScreen } from '@/features/ia/hooks/useAssistantScreen'
import { FilterToggleGroup, type FilterToggleOption } from './FilterToggleGroup'
import { FinancialPeriodPicker } from './FinancialPeriodPicker'
import {
  clearListFilters,
  countListFilters,
  FINANCIAL_SITUATION_FILTER_LABELS,
  periodOf,
  type FinancialFilters,
  type FinancialSituationFilter,
} from '../utils/filterFinancialEntries'
import { formatPeriod, isAllDates } from '../utils/periods'

const ALL = '__all__'

type TypeOption = FinancialEntryType | 'todos'

const TYPE_OPTIONS: FilterToggleOption<TypeOption>[] = [
  { value: 'todos', label: 'Tudo' },
  { value: 'receita', label: 'Recebimentos' },
  { value: 'despesa', label: 'Despesas' },
]

/** Ordem deliberada: o guarda-chuva primeiro, depois os três buckets que o
 * compõem, e "Pago" por último — a mesma leitura dos cards de indicador. */
const SITUATIONS: FinancialSituationFilter[] = [
  'a_receber',
  'a_vencer',
  'vencido',
  'condicao_especial',
  'pago',
]

/** The umbrella is "everything still open": for expenses that reads "A pagar". */
function situationLabel(situation: FinancialSituationFilter, type: FinancialEntryType | null) {
  return situation === 'a_receber' && type === 'despesa'
    ? 'A pagar (tudo)'
    : FINANCIAL_SITUATION_FILTER_LABELS[situation]
}

interface FinanceiroFilterBarProps {
  filters: FinancialFilters
  onChange: (filters: FinancialFilters) => void
}

/**
 * The bar at the top of the Financeiro: everything below it — cards, chart,
 * table — follows it (docs/financeiro.md). The period on the first line; the
 * list filters on the second.
 */
export function FinanceiroFilterBar({ filters, onChange }: FinanceiroFilterBarProps) {
  const period = periodOf(filters)
  const listFilterCount = countListFilters(filters)

  // Os filtros visíveis vão para o painel do Assistente com a pergunta. Cliente
  // e processo vêm dos combos só com o id, que é o que as tools usam.
  useAssistantScreen({
    filters: screenFilters([
      // The period goes with its dates: that is what the tools filter by.
      [
        'Período',
        filters.undatedOnly
          ? 'só lançamentos sem data'
          : isAllDates(period)
            ? 'todas as datas'
            : `${formatPeriod(period)} (${period.from ?? '…'} a ${period.to ?? '…'})`,
      ],
      ['Busca', filters.search.trim()],
      ['Tipo', filters.type && FINANCIAL_TYPE_LABELS[filters.type]],
      ['Situação', filters.situation && situationLabel(filters.situation, filters.type)],
      ['Cliente', filters.clientId && `id: ${filters.clientId}`],
      ['Processo', filters.legalProcessId && `id: ${filters.legalProcessId}`],
    ]),
  })

  function set<K extends keyof FinancialFilters>(key: K, value: FinancialFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <Card className="py-4">
      <CardContent className="space-y-3 px-4 sm:px-6">
        <FinancialPeriodPicker
          period={period}
          undatedOnly={filters.undatedOnly}
          onPeriodChange={(next) =>
            onChange({ ...filters, periodFrom: next.from, periodTo: next.to, undatedOnly: false })
          }
          onUndatedOnlyClear={() => set('undatedOnly', false)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <FilterToggleGroup
            label="Tipo"
            options={TYPE_OPTIONS}
            value={filters.type ?? 'todos'}
            onSelect={(value) => set('type', value === 'todos' ? null : value)}
          />

          <Select
            value={filters.situation ?? ALL}
            onValueChange={(v) =>
              set('situation', v === ALL ? null : (v as FinancialSituationFilter))
            }
          >
            <SelectTrigger className="h-9 w-[170px] text-sm">
              <SelectValue>
                {filters.situation
                  ? situationLabel(filters.situation, filters.type)
                  : 'Toda situação'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toda situação</SelectItem>
              {SITUATIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {situationLabel(s, filters.type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-[220px]">
            <ClienteCombobox
              value={filters.clientId}
              onChange={(id) => set('clientId', id)}
              placeholder="Todos os clientes"
              className="py-1.5"
            />
          </div>

          <div className="w-[260px]">
            <ProcessoCombobox
              value={filters.legalProcessId}
              onChange={(id) => set('legalProcessId', id)}
              placeholder="Todos os processos"
              className="py-1.5"
            />
          </div>

          {/* Busca */}
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              placeholder="Buscar por descrição, cliente ou CNJ..."
              className="h-9 pl-8 text-sm"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => set('search', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* The period stays: it has its own buttons, and "Tudo" is its way
              back to every date. */}
          {listFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(clearListFilters(filters))}
              className="h-9 text-muted-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Limpar ({listFilterCount})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
