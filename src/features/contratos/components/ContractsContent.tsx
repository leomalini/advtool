'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FileCheck2, FileSignature, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { getClientDisplayName } from '@/types/cliente.types'
import {
  CONTRACT_KIND_LABELS,
  CONTRACT_KINDS,
  CONTRACT_SITUATION_LABELS,
  getContractSituation,
  type ContractKind,
  type ContractSituation,
  type ContractWithRelations,
} from '@/types/contract.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { formatDate } from '@/utils/date'
import { useContracts } from '../hooks/useContracts'
import { ContractFormDialog } from './ContractFormDialog'
import { ContractSituationBadge } from './ContractSituationBadge'

const ALL = '__all__'
const SITUATIONS = Object.keys(CONTRACT_SITUATION_LABELS) as ContractSituation[]
const TABLE_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_200px_130px_170px_120px]'

/** "Em vigor" junta vigente e vencendo: os dois ainda valem, e o número do
 * topo não pode deixar de contar justamente o que está para vencer. */
type SituationFilter = ContractSituation | 'em_vigor'

const SITUATION_FILTERS: SituationFilter[] = ['em_vigor', ...SITUATIONS]

function filterLabel(filter: SituationFilter): string {
  return filter === 'em_vigor' ? 'Em vigor' : CONTRACT_SITUATION_LABELS[filter]
}

function filterMatches(filter: SituationFilter, situation: ContractSituation | undefined): boolean {
  return filter === 'em_vigor'
    ? situation === 'vigente' || situation === 'vencendo'
    : situation === filter
}

/** Os números do topo — cada um é também um filtro da lista. */
const TILES: { filter: SituationFilter; label: string; colorClass: string }[] = [
  { filter: 'em_vigor', label: 'Em vigor', colorClass: 'text-success' },
  { filter: 'aguardando_assinatura', label: 'Aguardando assinatura', colorClass: 'text-info' },
  { filter: 'vencendo', label: 'Vencendo', colorClass: 'text-warning' },
  { filter: 'vencido', label: 'Vencidos', colorClass: 'text-destructive' },
]

function clientName(contract: ContractWithRelations): string | null {
  return contract.client
    ? getClientDisplayName(contract.client as Parameters<typeof getClientDisplayName>[0])
    : null
}

function formatTerm(contract: ContractWithRelations): string {
  if (contract.start_date && contract.end_date) {
    return `${formatDate(contract.start_date)} – ${formatDate(contract.end_date)}`
  }
  if (contract.end_date) return `até ${formatDate(contract.end_date)}`
  if (contract.start_date) return `desde ${formatDate(contract.start_date)}`
  return 'Sem prazo'
}

export function ContractsContent() {
  const { data: contracts = [], isLoading } = useContracts()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [situationFilter, setSituationFilter] = useState<SituationFilter | null>(null)
  const [kindFilter, setKindFilter] = useState<ContractKind | null>(null)

  // Uma passada só: a situação de cada contrato alimenta os números e o filtro.
  const situations = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, getContractSituation(contract)])),
    [contracts]
  )

  // Mesmo critério do filtro, para o número do card e a lista do clique
  // nunca discordarem.
  const countOf = (filter: SituationFilter) =>
    [...situations.values()].filter((situation) => filterMatches(filter, situation)).length

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const queryDigits = query.replace(/\D/g, '')

    return contracts.filter((contract) => {
      if (situationFilter && !filterMatches(situationFilter, situations.get(contract.id))) {
        return false
      }
      if (kindFilter && contract.kind !== kindFilter) return false
      if (!query) return true

      const haystack = [contract.title, clientName(contract), contract.legal_process?.cnj_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesDigits =
        queryDigits.length > 0 &&
        (contract.legal_process?.cnj_number?.replace(/\D/g, '') ?? '').includes(queryDigits)
      return haystack.includes(query) || matchesDigits
    })
  }, [contracts, situations, search, situationFilter, kindFilter])

  const hasFilters = search.trim() !== '' || situationFilter !== null || kindFilter !== null

  function clearFilters() {
    setSearch('')
    setSituationFilter(null)
    setKindFilter(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contratos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Honorários, contratos dos clientes e do escritório
          </p>
        </div>
        <Can resource="contratos" action="create">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo contrato
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((tile) => {
          const active = situationFilter === tile.filter
          return (
            <button
              key={tile.filter}
              type="button"
              aria-pressed={active}
              onClick={() => setSituationFilter(active ? null : tile.filter)}
              className={cn(
                'rounded-lg border bg-card p-3 text-left transition-all',
                'hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-foreground/40 bg-muted/40' : 'border-border'
              )}
            >
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
              <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', tile.colorClass)}>
                {isLoading ? '—' : countOf(tile.filter)}
              </p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, cliente ou CNJ..."
            className="h-9 pl-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select
          value={situationFilter ?? ALL}
          onValueChange={(value) =>
            setSituationFilter(value === ALL ? null : (value as SituationFilter))
          }
        >
          <SelectTrigger className="h-9 w-[190px] text-sm" aria-label="Situação">
            <SelectValue>
              {situationFilter ? filterLabel(situationFilter) : 'Todas as situações'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            {SITUATION_FILTERS.map((filter) => (
              <SelectItem key={filter} value={filter}>
                {filterLabel(filter)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={kindFilter ?? ALL}
          onValueChange={(value) => setKindFilter(value === ALL ? null : (value as ContractKind))}
        >
          <SelectTrigger className="h-9 w-[200px] text-sm" aria-label="Tipo">
            <SelectValue>{kindFilter ? CONTRACT_KIND_LABELS[kindFilter] : 'Todos os tipos'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {CONTRACT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {CONTRACT_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" />
            Limpar
          </Button>
        )}

        {contracts.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} de {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-0 pb-1">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <EmptyState
              icon={FileSignature}
              title="Nenhum contrato ainda"
              description="Registre um contrato e anexe a minuta ou a versão assinada."
            />
          ) : (
            <div>
              <div
                className={cn(
                  TABLE_GRID,
                  'hidden gap-3 border-y bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground'
                )}
              >
                <span>Contrato</span>
                <span>Cliente</span>
                <span>Valor</span>
                <span>Vigência</span>
                <span>Situação</span>
              </div>

              <div className="divide-y">
                {filtered.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum contrato com esses filtros.
                  </p>
                )}

                {filtered.map((contract) => {
                  const signed = contract.documents?.some(
                    (document) => document.contract_file_role === 'assinado'
                  )
                  const client = clientName(contract)
                  return (
                    <Link
                      key={contract.id}
                      href={`/contratos/${contract.id}`}
                      className={cn(
                        TABLE_GRID,
                        'flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/20 md:items-center md:gap-3'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{contract.title}</span>
                          {signed && (
                            <FileCheck2
                              className="h-3.5 w-3.5 shrink-0 text-success"
                              aria-label="Versão assinada anexada"
                            />
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {CONTRACT_KIND_LABELS[contract.kind]}
                          {contract.legal_process?.cnj_number &&
                            ` · ${contract.legal_process.cnj_number}`}
                        </p>
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {client ?? '—'}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {contract.total_amount !== null ? formatCurrency(contract.total_amount) : '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTerm(contract)}</span>
                      <span>
                        <ContractSituationBadge contract={contract} bordered />
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
