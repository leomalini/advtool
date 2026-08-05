'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  Plus,
  Scale,
  Check,
  Undo2,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import {
  FINANCIAL_CATEGORY_LABELS,
  formatCurrency,
  isFinancialEntryOverdue,
} from '@/types/financialEntry.types'
import { getClientDisplayName } from '@/types/cliente.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import {
  useFinancialEntries,
  useFinancialSummary,
  useMonthlyCashFlow,
} from '../hooks/useFinancialEntries'
import {
  useCreateFinancialEntry,
  useUpdateFinancialEntry,
} from '../hooks/useFinancialEntryMutations'
import { FinancialEntryForm } from './FinancialEntryForm'
import { FinancialEntryDetailModal } from './FinancialEntryDetailModal'
import { FinanceiroFilterBar } from './FinanceiroFilterBar'
import {
  filterFinancialEntries,
  emptyFinancialFilters,
  monthRange,
  type FinancialFilters,
} from '../utils/filterFinancialEntries'

const chartConfig = {
  receita: { label: 'Receitas', color: 'var(--success)' },
  despesa: { label: 'Despesas', color: 'var(--destructive)' },
} satisfies ChartConfig

/** Uma constante só para cabeçalho e linhas não saírem de sincronia. */
const TABLE_GRID = 'grid grid-cols-[1fr_150px_150px_100px_120px_100px_44px]'

interface SummaryCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sublabel?: string
  colorClass: string
  bgClass: string
}

function SummaryCard({ icon, label, value, sublabel, colorClass, bgClass }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn('text-2xl font-semibold tabular-nums', colorClass)}>{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
          </div>
          <div className={cn('p-2.5 rounded-lg', bgClass)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function FinanceiroContent() {
  const { data: entries = [], isLoading } = useFinancialEntries()
  const { data: summary } = useFinancialSummary()
  const { data: cashFlow = [] } = useMonthlyCashFlow(6)
  const createEntry = useCreateFinancialEntry()
  const updateEntry = useUpdateFinancialEntry()
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FinancialFilters>(emptyFinancialFilters)

  // O detalhe lê da lista viva: guardar o objeto do clique congelaria os
  // valores após uma edição.
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null
  const setSelected = (entry: { id: string } | null) => setSelectedId(entry?.id ?? null)

  const chartData = useMemo(
    () =>
      cashFlow.map((m) => ({
        // 'yyyy-MM' → 'Jan', com o dia 1 só para o parse funcionar
        mes: format(parseISO(`${m.month}-01`), 'MMM', { locale: ptBR }),
        month: m.month,
        receita: m.receita,
        despesa: m.despesa,
      })),
    [cashFlow]
  )

  const filtered = useMemo(
    () => filterFinancialEntries(entries, filters),
    [entries, filters]
  )

  /** Clicar num mês do gráfico filtra a tabela por aquele período — e clicar de
   * novo no mesmo mês desfaz, para o gesto ser reversível sem caçar o botão de
   * limpar. */
  function handleMonthClick(month: string) {
    const { from, to } = monthRange(month)
    const alreadyFiltered = filters.dueFrom === from && filters.dueTo === to
    setFilters((prev) => ({
      ...prev,
      dueFrom: alreadyFiltered ? null : from,
      dueTo: alreadyFiltered ? null : to,
    }))
  }

  const selectedMonth =
    filters.dueFrom && filters.dueTo && filters.dueFrom.slice(0, 7) === filters.dueTo.slice(0, 7)
      ? filters.dueFrom.slice(0, 7)
      : null

  const totalReceitas = cashFlow.reduce((s, m) => s + m.receita, 0)
  const totalDespesas = cashFlow.reduce((s, m) => s + m.despesa, 0)

  async function handleCreate(data: FinancialEntryInput) {
    await createEntry.mutateAsync(data)
    setCreateOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Honorários, custas e despesas do escritório
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Lançamento
        </Button>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="h-4.5 w-4.5 text-success" />}
          label="Recebido no mês"
          value={formatCurrency(summary?.receivedThisMonth ?? 0)}
          colorClass="text-success"
          bgClass="bg-success/10"
        />
        <SummaryCard
          icon={<TrendingDown className="h-4.5 w-4.5 text-destructive" />}
          label="Despesas do mês"
          value={formatCurrency(summary?.expensesThisMonth ?? 0)}
          colorClass="text-destructive"
          bgClass="bg-destructive/10"
        />
        <SummaryCard
          icon={<Clock className="h-4.5 w-4.5 text-warning" />}
          label="A receber"
          value={formatCurrency(summary?.outstanding ?? 0)}
          sublabel="Receitas ainda não pagas"
          colorClass="text-warning"
          bgClass="bg-warning/10"
        />
        <SummaryCard
          icon={<ShieldAlert className="h-4.5 w-4.5 text-muted-foreground" />}
          label="Vencido"
          value={formatCurrency(summary?.overdue ?? 0)}
          sublabel={summary?.overdue ? 'Cobrança em atraso' : 'Nenhum atraso'}
          colorClass={summary?.overdue ? 'text-destructive' : 'text-muted-foreground'}
          bgClass={summary?.overdue ? 'bg-destructive/10' : 'bg-muted'}
        />
      </div>

      {/* ── Fluxo de caixa ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">
              Fluxo de Caixa — últimos 6 meses
            </CardTitle>
            {selectedMonth ? (
              <button
                type="button"
                onClick={() => setFilters((p) => ({ ...p, dueFrom: null, dueTo: null }))}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Filtrando {format(parseISO(`${selectedMonth}-01`), "MMMM", { locale: ptBR })}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground/70 hidden sm:block">
                Clique num mês para filtrar a tabela
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {cashFlow.length === 0 ? (
            <Skeleton className="h-[200px] w-full rounded-lg" />
          ) : (
            <>
              <ChartContainer config={chartConfig} className="w-full" style={{ height: 220 }}>
                {/* onClick no gráfico, não nas barras: pega a coluna inteira do
                    mês, incluindo o espaço vazio acima das barras — bem mais
                    fácil de acertar que uma barra de 22px. */}
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ left: 8, right: 8, top: 8 }}
                  onClick={(state) => {
                    // Recharts 3 entrega o índice da coluna ativa, não o payload
                    // (activePayload existia na v2). Resolvemos pelo chartData.
                    const index = Number(state?.activeIndex)
                    const month = Number.isInteger(index) ? chartData[index]?.month : undefined
                    if (month) handleMonthClick(month)
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mes"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    className="capitalize"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Legend
                    verticalAlign="top"
                    align="left"
                    height={32}
                    iconType="square"
                    iconSize={9}
                    formatter={(value: string) => (
                      <span className="text-xs text-muted-foreground">
                        {chartConfig[value as keyof typeof chartConfig]?.label ?? value}
                      </span>
                    )}
                  />
                  <Bar dataKey="receita" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="despesa" fill="var(--destructive)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ChartContainer>

              <div className="flex gap-6 mt-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Total receitas</p>
                  <p className="text-sm font-semibold text-success tabular-nums">
                    {formatCurrency(totalReceitas)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total despesas</p>
                  <p className="text-sm font-semibold text-destructive tabular-nums">
                    {formatCurrency(totalDespesas)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Resultado</p>
                  <p
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      totalReceitas - totalDespesas >= 0 ? 'text-foreground' : 'text-destructive'
                    )}
                  >
                    {formatCurrency(totalReceitas - totalDespesas)}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Tabela de lançamentos ── */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="text-sm font-semibold">Lançamentos</CardTitle>
          {entries.length > 0 && (
            <FinanceiroFilterBar
              filters={filters}
              onChange={setFilters}
              resultCount={filtered.length}
            />
          )}
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Scale className="w-7 h-7" />
              <p className="text-sm">Nenhum lançamento registrado</p>
              <p className="text-xs">
                Use &ldquo;Novo Lançamento&rdquo; ou a aba Financeiro de um caso/processo
              </p>
            </div>
          ) : (
            <div>
              <div className={cn(TABLE_GRID, 'gap-3 px-4 py-2 bg-muted/30 border-y text-xs font-medium text-muted-foreground')}>
                <span>Descrição</span>
                <span>Cliente</span>
                <span>Processo</span>
                <span>Categoria</span>
                <span className="text-right">Valor</span>
                <span>Vencimento</span>
                <span className="sr-only">Ações</span>
              </div>
              <div className="divide-y">
                {filtered.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nenhum lançamento com esses filtros.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilters(emptyFinancialFilters)}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}
                {filtered.map((entry) => {
                  const isReceita = entry.type === 'receita'
                  const isPaid = entry.status === 'pago'
                  const overdue = isFinancialEntryOverdue(entry)

                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelected(entry)
                      }}
                      className={cn(
                        TABLE_GRID,
                        'gap-3 px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition-colors group',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0',
                            isPaid
                              ? 'bg-success/10 text-success border-success/25'
                              : overdue
                                ? 'bg-destructive/10 text-destructive border-destructive/25'
                                : 'bg-warning/10 text-warning border-warning/25'
                          )}
                        >
                          {isPaid ? 'Pago' : overdue ? 'Atrasado' : 'Pendente'}
                        </span>
                        <span className="text-sm truncate">{entry.description}</span>
                      </div>

                      {/* Cliente e Processo são links: clicar leva ao registro,
                          e o stopPropagation impede que a linha abra junto. */}
                      {entry.client ? (
                        <Link
                          href={`/clientes?id=${entry.client.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline"
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
                          href={`/processos?id=${entry.legal_process.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-mono text-muted-foreground truncate hover:text-foreground hover:underline"
                          title={entry.legal_process.cnj_number ?? undefined}
                        >
                          {entry.legal_process.cnj_number ?? 'Sem CNJ'}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {FINANCIAL_CATEGORY_LABELS[entry.category]}
                      </p>

                      <p
                        className={cn(
                          'text-sm font-semibold text-right tabular-nums',
                          isReceita ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {isReceita ? '+' : '−'}
                        {formatCurrency(Number(entry.amount))}
                      </p>

                      <p className={cn('text-xs text-muted-foreground', overdue && 'text-destructive')}>
                        {format(parseISO(entry.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>

                      {/* Baixa em um clique — o gesto mais repetido do módulo,
                          sem precisar abrir o lançamento. */}
                      <button
                        type="button"
                        title={isPaid ? 'Reabrir (marcar como pendente)' : 'Marcar como pago'}
                        aria-label={isPaid ? 'Reabrir lançamento' : 'Marcar como pago'}
                        onClick={(e) => {
                          e.stopPropagation() // não abre o detalhe
                          updateEntry.mutate({
                            id: entry.id,
                            status: isPaid ? 'pendente' : 'pago',
                          })
                        }}
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
                          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                          isPaid
                            ? 'border-border text-muted-foreground hover:bg-muted'
                            : 'border-success/40 text-success hover:bg-success/10'
                        )}
                      >
                        {isPaid ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          <FinancialEntryForm onSubmit={handleCreate} isLoading={createEntry.isPending} />
        </DialogContent>
      </Dialog>

      <FinancialEntryDetailModal
        entry={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
