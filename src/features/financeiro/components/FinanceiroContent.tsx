'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Clock, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CASOS, AREAS_JURIDICAS, ADVOGADOS } from '@/data/mock'
import type { MovimentacaoFinanceira } from '@/data/mock'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

const STATUS_CONFIG: Record<
  MovimentacaoFinanceira['status'],
  { label: string; className: string }
> = {
  pago: {
    label: 'Pago',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  pendente: {
    label: 'Pendente',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  atrasado: {
    label: 'Atrasado',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
}

const TIPO_CONFIG: Record<
  MovimentacaoFinanceira['categoria'],
  { label: string }
> = {
  honorario: { label: 'Honorário' },
  custas: { label: 'Custas' },
  pericia: { label: 'Perícia' },
  outros: { label: 'Outros' },
}

// Dados de fluxo de caixa estáticos para o gráfico visual
const FLUXO_CAIXA = [
  { mes: 'Jan', receita: 22000, despesa: 980 },
  { mes: 'Fev', receita: 18500, despesa: 1100 },
  { mes: 'Mar', receita: 25000, despesa: 1250 },
  { mes: 'Abr', receita: 29200, despesa: 890 },
  { mes: 'Mai', receita: 32000, despesa: 1180 },
  { mes: 'Jun', receita: 38500, despesa: 1342 },
]

const MAX_RECEITA = Math.max(...FLUXO_CAIXA.map((d) => d.receita))

// Receitas por área jurídica
const RECEITAS_POR_AREA = [
  { area: 'tributario' as const, valor: 135000 },
  { area: 'trabalhista' as const, valor: 20000 },
  { area: 'familia' as const, valor: 8892 },
  { area: 'civel' as const, valor: 3500 },
]
const MAX_AREA = Math.max(...RECEITAS_POR_AREA.map((a) => a.valor))

// ── Sub-components ─────────────────────────────────────────────

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
            <p className={cn('text-2xl font-semibold', colorClass)}>{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
          </div>
          <div className={cn('p-2.5 rounded-lg', bgClass)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function FinanceiroContent() {
  // Agregar todas as movimentações
  const todasMovimentacoes = useMemo(() => {
    return CASOS.flatMap((caso) =>
      caso.financeiro.map((mov) => ({
        ...mov,
        clienteNome: caso.clienteNome,
        casoLabel: `${caso.clienteNome} — ${AREAS_JURIDICAS[caso.areaJuridica].label}`,
      })),
    )
  }, [])

  const receitas = todasMovimentacoes.filter((m) => m.tipo === 'receita')
  const despesas = todasMovimentacoes.filter((m) => m.tipo === 'despesa')

  const receitasMesPago = receitas
    .filter((m) => m.status === 'pago')
    .reduce((acc, m) => acc + m.valor, 0)

  const despesasMes = despesas.reduce((acc, m) => acc + m.valor, 0)

  const aReceber = receitas
    .filter((m) => m.status === 'pendente')
    .reduce((acc, m) => acc + m.valor, 0)

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visão geral das finanças do escritório — Junho 2025
        </p>
      </div>

      {/* ── Seção 1: Cards de resumo ── */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="h-4.5 w-4.5 text-emerald-600" />}
          label="Receitas do mês"
          value={formatCurrency(receitasMesPago)}
          sublabel="+31,8% vs. mês anterior"
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <SummaryCard
          icon={<TrendingDown className="h-4.5 w-4.5 text-red-500" />}
          label="Despesas do mês"
          value={formatCurrency(despesasMes)}
          sublabel="Custas e operacional"
          colorClass="text-red-500"
          bgClass="bg-red-50"
        />
        <SummaryCard
          icon={<Clock className="h-4.5 w-4.5 text-amber-600" />}
          label="A receber"
          value={formatCurrency(aReceber)}
          sublabel="Honorários pendentes"
          colorClass="text-amber-600"
          bgClass="bg-amber-50"
        />
        <SummaryCard
          icon={<ShieldAlert className="h-4.5 w-4.5 text-slate-400" />}
          label="Inadimplência"
          value="R$ 0,00"
          sublabel="Nenhum atraso registrado"
          colorClass="text-slate-500"
          bgClass="bg-slate-100"
        />
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* ── Seção 2: Fluxo de Caixa ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Fluxo de Caixa — Jan a Jun 2025</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Legenda */}
            <div className="flex items-center gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                <span className="text-xs text-muted-foreground">Receitas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                <span className="text-xs text-muted-foreground">Despesas</span>
              </div>
            </div>

            {/* Barras */}
            <div className="flex items-end gap-3 h-40">
              {FLUXO_CAIXA.map((item) => {
                const alturaReceita = (item.receita / MAX_RECEITA) * 100
                const alturaDesp = Math.max((item.despesa / MAX_RECEITA) * 100, 2)
                return (
                  <div key={item.mes} className="flex-1 flex flex-col items-center gap-1.5">
                    {/* Barras lado a lado */}
                    <div className="w-full flex items-end justify-center gap-1 h-32">
                      <div
                        className="flex-1 max-w-[18px] rounded-t-sm bg-emerald-500 transition-all"
                        style={{ height: `${alturaReceita}%` }}
                        title={`Receita: ${formatCurrency(item.receita)}`}
                      />
                      <div
                        className="flex-1 max-w-[18px] rounded-t-sm bg-red-400 transition-all"
                        style={{ height: `${alturaDesp}%` }}
                        title={`Despesa: ${formatCurrency(item.despesa)}`}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{item.mes}</span>
                  </div>
                )
              })}
            </div>

            {/* Totais do período */}
            <div className="flex gap-6 mt-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Total receitas (6m)</p>
                <p className="text-sm font-semibold text-emerald-600">
                  {formatCurrency(FLUXO_CAIXA.reduce((a, d) => a + d.receita, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total despesas (6m)</p>
                <p className="text-sm font-semibold text-red-500">
                  {formatCurrency(FLUXO_CAIXA.reduce((a, d) => a + d.despesa, 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado líquido</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(
                    FLUXO_CAIXA.reduce((a, d) => a + d.receita - d.despesa, 0),
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Seção 4 + 5: Por área e por advogado ── */}
        <div className="space-y-4">
          {/* Por área jurídica */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Área Jurídica</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {RECEITAS_POR_AREA.map(({ area, valor }) => {
                  const pct = Math.round((valor / MAX_AREA) * 100)
                  const info = AREAS_JURIDICAS[area]
                  return (
                    <div key={area}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-xs font-medium', info.color)}>{info.label}</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(valor)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', info.bg.replace('bg-', 'bg-').replace('-50', '-400'))}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Por advogado */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Advogado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { advId: 'adv-1', emCausa: 155000, honorarios: 23000 },
                  { advId: 'adv-2', emCausa: 11500, honorarios: 8000 },
                ].map(({ advId, emCausa, honorarios }) => {
                  const adv = ADVOGADOS.find((a) => a.id === advId)
                  if (!adv) return null
                  return (
                    <div key={advId} className="flex items-center gap-3">
                      <div
                        className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
                          adv.cor,
                        )}
                      >
                        {adv.iniciais}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{adv.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Em causa: {formatCurrency(emCausa)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-emerald-600">
                          {formatCurrency(honorarios)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">honorários</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Seção 3: Tabela de movimentações ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Honorários e Movimentações</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {todasMovimentacoes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground px-4">
              Nenhuma movimentação registrada.
            </div>
          ) : (
            <div>
              {/* Cabeçalho */}
              <div className="grid grid-cols-[1fr_180px_160px_100px_130px_110px] gap-4 px-4 py-2 bg-muted/30 border-y text-xs font-medium text-muted-foreground">
                <span>Descrição</span>
                <span>Cliente</span>
                <span>Caso</span>
                <span>Tipo</span>
                <span>Valor</span>
                <span>Vencimento</span>
              </div>
              <div className="divide-y">
                {todasMovimentacoes.map((mov) => (
                  <div
                    key={mov.id}
                    className="grid grid-cols-[1fr_180px_160px_100px_130px_110px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
                  >
                    {/* Descrição + status */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0',
                          STATUS_CONFIG[mov.status].className,
                        )}
                      >
                        {STATUS_CONFIG[mov.status].label}
                      </span>
                      <span className="text-sm truncate">{mov.descricao}</span>
                    </div>

                    {/* Cliente */}
                    <p className="text-xs text-muted-foreground truncate">{mov.clienteNome}</p>

                    {/* Caso */}
                    <p className="text-xs text-muted-foreground truncate">{mov.casoLabel}</p>

                    {/* Tipo */}
                    <p className="text-xs text-muted-foreground">
                      {TIPO_CONFIG[mov.categoria].label}
                    </p>

                    {/* Valor */}
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        mov.tipo === 'receita' ? 'text-emerald-600' : 'text-red-500',
                      )}
                    >
                      {mov.tipo === 'despesa' ? '−' : '+'}
                      {formatCurrency(mov.valor)}
                    </p>

                    {/* Vencimento */}
                    <p className="text-xs text-muted-foreground">{formatDate(mov.vencimento)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
