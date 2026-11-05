'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Percent, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/components/shared/Can'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { getClientDisplayName } from '@/types/cliente.types'
import {
  describePercentageNote,
  estimatedFee,
  formatCurrency,
  getCashFlowDate,
  getSuccessFeeStage,
  isToAssess,
  type FinancialEntryWithRelations,
  type SuccessFeeStage,
} from '@/types/financialEntry.types'
import { SuccessFeeStageBadge } from './SuccessFeeStageBadge'
import {
  defaultFinancialFilters,
  filterFinancialEntries,
  sortByCashFlowDate,
} from '../utils/filterFinancialEntries'
import {
  matchesSuccessFeeFilter,
  summarizeSuccessFees,
  type SuccessFeeFilter,
} from '../utils/successFees'

/** What needs a hand first: assessing, then charging, then the rest. */
const STAGE_ORDER: Record<SuccessFeeStage, number> = {
  a_apurar: 0,
  vencido: 1,
  a_vencer: 2,
  aguardando: 3,
  recebido: 4,
}

const TABLE_GRID = 'grid grid-cols-[1fr_150px_150px_120px_120px_44px]'

const PRESSABLE =
  'rounded-lg border p-3 text-left transition-all hover:border-foreground/25 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function formatDay(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy')
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

interface TotalCardProps {
  label: string
  value: string
  sublabel: string
  colorClass: string
  active: boolean
  onClick: () => void
}

function TotalCard({ label, value, sublabel, colorClass, active, onClick }: TotalCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(PRESSABLE, active ? 'border-foreground/40 bg-muted/40' : 'border-border')}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', colorClass)}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{sublabel}</p>
    </button>
  )
}

interface SuccessFeesPanelProps {
  /** Every entry; the panel keeps the success fees (category Êxito). */
  entries: FinancialEntryWithRelations[]
  isLoading: boolean
  onOpenEntry: (id: string) => void
  onAssess: (id: string) => void
  onRegister: () => void
}

/**
 * The Êxitos tab (docs/financeiro.md): every success fee of every process,
 * with no period — one to assess has no date. The estimate is added up apart,
 * never into "A receber". Its own filters; the cards filter the list.
 */
export function SuccessFeesPanel({
  entries,
  isLoading,
  onOpenEntry,
  onAssess,
  onRegister,
}: SuccessFeesPanelProps) {
  const { can } = usePermissions()
  const [stageFilter, setStageFilter] = useState<SuccessFeeFilter | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [processId, setProcessId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const successFees = useMemo(
    () => entries.filter((entry) => entry.category === 'exito' && entry.type === 'receita'),
    [entries]
  )
  // The cards follow client, process and search — not their own slice.
  const matching = useMemo(
    () =>
      filterFinancialEntries(successFees, {
        ...defaultFinancialFilters(),
        periodFrom: null,
        periodTo: null,
        search,
        clientId,
        legalProcessId: processId,
      }),
    [successFees, search, clientId, processId]
  )
  const totals = useMemo(() => summarizeSuccessFees(matching), [matching])
  const rows = useMemo(() => {
    const listed = stageFilter
      ? matching.filter((entry) =>
          matchesSuccessFeeFilter(getSuccessFeeStage(entry), stageFilter)
        )
      : matching
    // Stable sort: by stage, and by date within it (most recent first).
    return sortByCashFlowDate(listed).sort(
      (a, b) => STAGE_ORDER[getSuccessFeeStage(a)] - STAGE_ORDER[getSuccessFeeStage(b)]
    )
  }, [matching, stageFilter])

  const toggle = (filter: SuccessFeeFilter) =>
    setStageFilter((current) => (current === filter ? null : filter))
  const hasFilters = clientId !== null || processId !== null || search.trim() !== ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Os êxitos de todos os processos. Enquanto a apurar, ficam em R$ 0: a estimativa
          aparece aqui, à parte, e nunca entra no A receber.
        </p>
        <Can resource="financeiro" action="create">
          <Button size="sm" variant="outline" onClick={onRegister}>
            <Plus className="mr-1.5 h-4 w-4" />
            Registrar êxito
          </Button>
        </Can>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <TotalCard
          label="A apurar"
          value={pluralize(totals.toAssess.count, 'êxito', 'êxitos')}
          sublabel={
            totals.toAssess.count === 0
              ? 'Nenhum'
              : [
                  totals.toAssess.estimate > 0 && `est. ${formatCurrency(totals.toAssess.estimate)}`,
                  totals.toAssess.withoutEstimate > 0 &&
                    `${totals.toAssess.withoutEstimate} sem estimativa`,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
          colorClass="text-foreground"
          active={stageFilter === 'a_apurar'}
          onClick={() => toggle('a_apurar')}
        />
        <TotalCard
          label="Aguardando"
          value={formatCurrency(totals.awaiting.amount)}
          sublabel={
            totals.awaiting.count ? `${totals.awaiting.count} com valor definido` : 'Nenhum'
          }
          colorClass={totals.awaiting.amount ? 'text-info' : 'text-muted-foreground'}
          active={stageFilter === 'aguardando'}
          onClick={() => toggle('aguardando')}
        />
        <TotalCard
          label="A receber"
          value={formatCurrency(totals.receivable.amount)}
          sublabel={
            totals.receivable.overdue
              ? `${formatCurrency(totals.receivable.overdue)} vencido`
              : 'Nada vencido'
          }
          colorClass={totals.receivable.overdue ? 'text-destructive' : 'text-warning'}
          active={stageFilter === 'a_receber'}
          onClick={() => toggle('a_receber')}
        />
        <TotalCard
          label="Recebido"
          value={formatCurrency(totals.received.amount)}
          sublabel={pluralize(totals.received.count, 'lançamento', 'lançamentos')}
          colorClass={totals.received.amount ? 'text-success' : 'text-muted-foreground'}
          active={stageFilter === 'recebido'}
          onClick={() => toggle('recebido')}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <CardTitle className="text-sm font-semibold">Êxitos</CardTitle>
            {!isLoading && successFees.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {pluralize(rows.length, 'êxito', 'êxitos')}
              </span>
            )}
          </div>
          {successFees.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[220px]">
                <ClienteCombobox
                  value={clientId}
                  onChange={setClientId}
                  placeholder="Todos os clientes"
                  className="py-1.5"
                />
              </div>
              <div className="w-[260px]">
                <ProcessoCombobox
                  value={processId}
                  onChange={setProcessId}
                  placeholder="Todos os processos"
                  className="py-1.5"
                />
              </div>
              <div className="relative min-w-[200px] max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por descrição, cliente ou CNJ..."
                  className="h-9 pl-8 text-sm"
                />
              </div>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setClientId(null)
                    setProcessId(null)
                    setSearch('')
                  }}
                  className="h-9 text-muted-foreground"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Limpar
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : successFees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Percent className="h-7 w-7" />
              <p className="text-sm">Nenhum êxito registrado</p>
              <p className="max-w-md text-xs">
                Use “Registrar êxito” aqui ou na aba Financeiro de um processo. O êxito do
                contrato de honorários entra sozinho ao lançar as parcelas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div
                className={cn(
                  TABLE_GRID,
                  'min-w-[820px] gap-3 border-y bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground'
                )}
              >
                <span>Êxito</span>
                <span>Cliente</span>
                <span>Processo</span>
                <span className="text-right">Valor</span>
                <span>Situação</span>
                <span className="sr-only">Ações</span>
              </div>
              <div className="divide-y">
                {rows.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum êxito com esses filtros.
                  </p>
                )}
                {rows.map((entry) => {
                  const toAssess = isToAssess(entry)
                  const estimate = estimatedFee(entry)
                  const date = getCashFlowDate(entry)
                  const stage = getSuccessFeeStage(entry)
                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenEntry(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onOpenEntry(entry.id)
                      }}
                      className={cn(
                        TABLE_GRID,
                        'group min-w-[820px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{entry.description}</p>
                        <p className="truncate text-[11px] text-info/80">
                          {describePercentageNote(entry) ?? 'Valor fixo'}
                        </p>
                      </div>

                      {entry.client ? (
                        <Link
                          href={`/clientes/${entry.client.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {getClientDisplayName(
                            entry.client as Parameters<typeof getClientDisplayName>[0]
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      {entry.legal_process ? (
                        <Link
                          href={`/processos/${entry.legal_process.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                          title={entry.legal_process.cnj_number ?? undefined}
                        >
                          {entry.legal_process.cnj_number ?? 'Sem CNJ'}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      <div className="text-right">
                        {toAssess ? (
                          <>
                            <p className="text-sm text-muted-foreground">a apurar</p>
                            {estimate !== null && (
                              <p className="text-[11px] text-muted-foreground/70">
                                est. {formatCurrency(estimate)}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm font-semibold tabular-nums text-success">
                            {formatCurrency(Number(entry.amount))}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <SuccessFeeStageBadge entry={entry} />
                        {date && (
                          <p className="text-[11px] text-muted-foreground">
                            {stage === 'recebido'
                              ? `pago ${formatDay(date)}`
                              : entry.settlement_kind === 'conditional'
                                ? `prev. ${formatDay(date)}`
                                : formatDay(date)}
                          </p>
                        )}
                      </div>

                      {toAssess && can('financeiro', 'update') ? (
                        <button
                          type="button"
                          title="Apurar"
                          aria-label={`Apurar "${entry.description}"`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAssess(entry.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Percent className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
