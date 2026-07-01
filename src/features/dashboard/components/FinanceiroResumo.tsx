import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DASHBOARD_STATS, CASOS } from '@/data/mock'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function FinanceiroResumo() {
  // Calcula total a receber somando financeiro pendente de todos os casos
  const aReceber = CASOS.reduce((sum, caso) => {
    return (
      sum +
      caso.financeiro
        .filter((f) => f.tipo === 'receita' && f.status === 'pendente')
        .reduce((s, f) => s + f.valor, 0)
    )
  }, 0)

  const variacaoPerc = Math.round(
    ((DASHBOARD_STATS.receitaMesAtual - DASHBOARD_STATS.receitaMesAnterior) /
      DASHBOARD_STATS.receitaMesAnterior) *
      100
  )

  // Progresso do mês (comparado ao mês anterior como meta)
  const progresso = Math.min(
    Math.round((DASHBOARD_STATS.receitaMesAtual / (DASHBOARD_STATS.receitaMesAnterior * 1.3)) * 100),
    100
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-500" />
          Financeiro do Mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Receita */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-emerald-700 font-medium">Receita</span>
            <div className="flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
              <TrendingUp className="h-3 w-3" />
              +{variacaoPerc}%
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700">
            {formatBRL(DASHBOARD_STATS.receitaMesAtual)}
          </p>
          <p className="text-xs text-emerald-600/70 mt-0.5">
            mês anterior: {formatBRL(DASHBOARD_STATS.receitaMesAnterior)}
          </p>
        </div>

        {/* Despesas */}
        <div className="rounded-lg bg-red-50 border border-red-100 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-red-700 font-medium">Despesas</span>
            <TrendingDown className="h-3 w-3 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {formatBRL(DASHBOARD_STATS.despesasMes)}
          </p>
        </div>

        {/* A receber */}
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-amber-700 font-medium">A receber</span>
            <span className="text-xs text-amber-600 font-medium">honorários êxito</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">
            {formatBRL(aReceber)}
          </p>
        </div>

        {/* Barra de progresso do mês */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Meta do mês</span>
            <span className="font-medium text-foreground">{progresso}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatBRL(DASHBOARD_STATS.receitaMesAtual)} de{' '}
            {formatBRL(Math.round(DASHBOARD_STATS.receitaMesAnterior * 1.3))}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
