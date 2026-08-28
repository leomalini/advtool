'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
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
  getFinancialSituation,
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
import { FinancialSituationBadge } from './FinancialSituationBadge'
import {
  filterFinancialEntries,
  emptyFinancialFilters,
  monthRange,
  type FinancialFilters,
  type FinancialSituationFilter,
} from '../utils/filterFinancialEntries'
import { Can } from '@/components/shared/Can'

/** Chave da coluna "Sem data" no gráfico. Não é 'yyyy-MM' de propósito: o
 * parse de mês tem que falhar ruidosamente se alguém tratá-la como um mês. */
const UNDATED_KEY = 'undated'

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

interface ReceivableTileProps {
  label: string
  value: number
  sublabel?: string
  colorClass: string
  active: boolean
  onClick: () => void
}

/** Uma das três parcelas que somam "A receber". Clicável porque o indicador e
 * o filtro passaram a falar a mesma língua: o card mostra o número, o clique
 * mostra de quais lançamentos ele veio. */
function ReceivableTile({
  label,
  value,
  sublabel,
  colorClass,
  active,
  onClick,
}: ReceivableTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border p-3 text-left transition-all',
        'hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-foreground/40 bg-muted/40' : 'border-border'
      )}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums mt-0.5', colorClass)}>
        {formatCurrency(value)}
      </p>
      <p className="text-[11px] text-muted-foreground/80 mt-0.5 h-4">{sublabel ?? ''}</p>
    </button>
  )
}

export function FinanceiroContent() {
  const { data: entries = [], isLoading } = useFinancialEntries()
  const { data: summary } = useFinancialSummary()
  const { data: cashFlow } = useMonthlyCashFlow(6)
  const createEntry = useCreateFinancialEntry()
  const updateEntry = useUpdateFinancialEntry()
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FinancialFilters>(emptyFinancialFilters)

  // O detalhe lê da lista viva: guardar o objeto do clique congelaria os
  // valores após uma edição.
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null
  const setSelected = (entry: { id: string } | null) => setSelectedId(entry?.id ?? null)

  const chartData = useMemo(() => {
    if (!cashFlow) return []

    const months = cashFlow.months.map((m) => ({
      // 'yyyy-MM' → 'Jan', com o dia 1 só para o parse funcionar
      mes: format(parseISO(`${m.month}-01`), 'MMM', { locale: ptBR }),
      month: m.month,
      receita: m.receita,
      despesa: m.despesa,
    }))

    // A coluna "Sem data" só aparece quando existe algo nela: uma barra vazia
    // permanente ensinaria o olho a ignorá-la justamente quando ela importa.
    if (cashFlow.undated.count === 0) return months

    return [
      ...months,
      {
        mes: 'Sem data',
        month: UNDATED_KEY,
        receita: cashFlow.undated.receita,
        despesa: cashFlow.undated.despesa,
      },
    ]
  }, [cashFlow])

  const filtered = useMemo(
    () => filterFinancialEntries(entries, filters),
    [entries, filters]
  )

  /** Alterna um bucket: clicar de novo no mesmo card desfaz o filtro. */
  function toggleSituation(situation: FinancialSituationFilter) {
    setFilters((prev) => ({
      ...prev,
      situation: prev.situation === situation ? null : situation,
    }))
  }

  /** Clicar numa coluna do gráfico filtra a tabela por aquele recorte — e
   * clicar de novo desfaz, para o gesto ser reversível sem caçar o botão de
   * limpar. */
  function handleColumnClick(key: string) {
    if (key === UNDATED_KEY) {
      // "Sem data" não é um período: vira o filtro próprio, e o intervalo sai
      // do caminho para os dois não se contradizerem.
      setFilters((prev) => ({
        ...prev,
        undatedOnly: !prev.undatedOnly,
        dueFrom: null,
        dueTo: null,
      }))
      return
    }

    const { from, to } = monthRange(key)
    const alreadyFiltered = filters.dueFrom === from && filters.dueTo === to
    setFilters((prev) => ({
      ...prev,
      dueFrom: alreadyFiltered ? null : from,
      dueTo: alreadyFiltered ? null : to,
      undatedOnly: false,
    }))
  }

  const selectedMonth =
    filters.dueFrom && filters.dueTo && filters.dueFrom.slice(0, 7) === filters.dueTo.slice(0, 7)
      ? filters.dueFrom.slice(0, 7)
      : null

  // Os totais do rodapé ficam nos 6 meses. Somar o sem-data aqui inflaria o
  // "Resultado" com dinheiro que depende de um evento sem prazo — ele aparece
  // na coluna e no seu próprio número, separado do que tem data.
  const totalReceitas = (cashFlow?.months ?? []).reduce((s, m) => s + m.receita, 0)
  const totalDespesas = (cashFlow?.months ?? []).reduce((s, m) => s + m.despesa, 0)

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
        <Can resource="financeiro" action="create">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Lançamento
          </Button>
        </Can>
      </div>

      {/* ── Realizado no mês ── */}
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      {/* ── A receber ──
          Hierarquia, não quatro cards soltos: o número grande é o TUDO, e as
          três parcelas ao lado somam exatamente ele. */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <button
              type="button"
              onClick={() => toggleSituation('a_receber')}
              aria-pressed={filters.situation === 'a_receber'}
              className={cn(
                'shrink-0 rounded-lg border p-3 text-left transition-all lg:w-56',
                'hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filters.situation === 'a_receber'
                  ? 'border-foreground/40 bg-muted/40'
                  : 'border-transparent'
              )}
            >
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className="text-3xl font-semibold tabular-nums mt-0.5">
                {formatCurrency(summary?.receivableTotal ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                Tudo que ainda não foi recebido
              </p>
            </button>

            <span className="hidden lg:block text-lg text-muted-foreground/40">=</span>

            {/* min-w-0: um item flex tem `min-width: auto`, então sem isto o
                grid se recusa a encolher abaixo do conteúdo das três parcelas
                e empurra a linha para fora do card em telas estreitas. */}
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              <ReceivableTile
                label="A vencer"
                value={summary?.receivableUpcoming ?? 0}
                sublabel="Com data, no prazo"
                colorClass="text-warning"
                active={filters.situation === 'a_vencer'}
                onClick={() => toggleSituation('a_vencer')}
              />
              <ReceivableTile
                label="Vencido"
                value={summary?.receivableOverdue ?? 0}
                sublabel={summary?.receivableOverdue ? 'Cobrança em atraso' : 'Nenhum atraso'}
                colorClass={
                  summary?.receivableOverdue ? 'text-destructive' : 'text-muted-foreground'
                }
                active={filters.situation === 'vencido'}
                onClick={() => toggleSituation('vencido')}
              />
              <ReceivableTile
                label="Condição especial"
                value={summary?.receivableConditional ?? 0}
                sublabel={
                  summary?.receivableConditionalCount
                    ? `${summary.receivableConditionalCount} lançamento${
                        summary.receivableConditionalCount === 1 ? '' : 's'
                      }`
                    : 'Nenhum'
                }
                colorClass={
                  summary?.receivableConditional ? 'text-info' : 'text-muted-foreground'
                }
                active={filters.situation === 'condicao_especial'}
                onClick={() => toggleSituation('condicao_especial')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Fluxo de caixa ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">
              Fluxo de Caixa — últimos 6 meses
            </CardTitle>
            {selectedMonth || filters.undatedOnly ? (
              <button
                type="button"
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    dueFrom: null,
                    dueTo: null,
                    undatedOnly: false,
                  }))
                }
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Filtrando{' '}
                {selectedMonth
                  ? format(parseISO(`${selectedMonth}-01`), 'MMMM', { locale: ptBR })
                  : 'sem data'}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground/70 hidden sm:block">
                Clique numa coluna para filtrar a tabela
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
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
                    const key = Number.isInteger(index) ? chartData[index]?.month : undefined
                    if (key) handleColumnClick(key)
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
                  {/* ⚠️ Passar `formatter` substitui a LINHA INTEIRA do
                      tooltip — o quadradinho colorido e o nome da série somem
                      junto (ver ChartTooltipContent). Por isso o formatter
                      remonta a linha: sem ela, o tooltip mostra dois valores
                      nus e não dá para saber qual é receita e qual é despesa. */}
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const serie = chartConfig[name as keyof typeof chartConfig]
                          return (
                            <div className="flex w-full items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                  style={{ backgroundColor: serie?.color }}
                                />
                                <span className="text-muted-foreground">
                                  {serie?.label ?? name}
                                </span>
                              </span>
                              <span
                                className="font-medium tabular-nums"
                                style={{ color: serie?.color }}
                              >
                                {formatCurrency(Number(value))}
                              </span>
                            </div>
                          )
                        }}
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

                {/* Fora do resultado de propósito — ver o cálculo dos totais. */}
                {cashFlow && cashFlow.undated.count > 0 && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">Sem data definida</p>
                    <p className="text-sm font-semibold text-info tabular-nums">
                      {formatCurrency(cashFlow.undated.receita - cashFlow.undated.despesa)}
                    </p>
                  </div>
                )}
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
            // As colunas fixas somam ~736px + gaps; abaixo disso a tabela rola
            // dentro do próprio card, em vez de empurrar a página.
            <div className="overflow-x-auto">
              <div className={cn(TABLE_GRID, 'min-w-[820px] gap-3 px-4 py-2 bg-muted/30 border-y text-xs font-medium text-muted-foreground')}>
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
                  const situation = getFinancialSituation(entry)
                  const overdue = situation === 'vencido'
                  const isConditional = entry.settlement_kind === 'conditional'

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
                        // Mesmo min-w do cabeçalho — sem isto as duas partes
                        // desalinham assim que a tabela rola na horizontal.
                        'min-w-[820px] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition-colors group',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <FinancialSituationBadge entry={entry} short bordered />
                          <span className="text-sm truncate">{entry.description}</span>
                        </div>
                        {/* A condição é o "vencimento" destes lançamentos —
                            escondê-la deixaria a linha sem dizer o que se
                            espera para receber. */}
                        {isConditional && entry.condition_description && (
                          <p
                            className="text-[11px] text-info/80 truncate mt-0.5 pl-1"
                            title={entry.condition_description}
                          >
                            {entry.condition_description}
                          </p>
                        )}
                      </div>

                      {/* Cliente e Processo são links: clicar leva ao registro,
                          e o stopPropagation impede que a linha abra junto. */}
                      {entry.client ? (
                        <Link
                          href={`/clientes/${entry.client.id}`}
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

                      {/* Sem data é estado válido agora (condição especial):
                          formatar null aqui devolveria "Invalid Date". */}
                      {entry.due_date ? (
                        <p
                          className={cn(
                            'text-xs text-muted-foreground',
                            overdue && 'text-destructive'
                          )}
                        >
                          {isConditional && (
                            <span className="text-muted-foreground/60">prev. </span>
                          )}
                          {format(parseISO(entry.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">Sem data</p>
                      )}

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
