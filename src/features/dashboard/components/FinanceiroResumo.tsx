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
          <DollarSign className="h-4 w-4 text-success" />
          Financeiro do Mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Receita */}
        <div className="rounded-lg bg-success/10 border border-success/20 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-success font-medium">Receita</span>
            <div className="flex items-center gap-0.5 text-xs text-success font-medium">
              <TrendingUp className="h-3 w-3" />
              +{variacaoPerc}%
            </div>
          </div>
          <p className="text-2xl font-bold text-success tabular-nums">
            {formatBRL(DASHBOARD_STATS.receitaMesAtual)}
          </p>
          <p className="text-xs text-success/70 mt-0.5">
            mês anterior: {formatBRL(DASHBOARD_STATS.receitaMesAnterior)}
          </p>
        </div>

        {/* Despesas */}
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-destructive font-medium">Despesas</span>
            <TrendingDown className="h-3 w-3 text-destructive" />
          </div>
          <p className="text-2xl font-bold text-destructive tabular-nums">
            {formatBRL(DASHBOARD_STATS.despesasMes)}
          </p>
        </div>

        {/* A receber */}
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-warning font-medium">A receber</span>
            <span className="text-xs text-warning font-medium">honorários êxito</span>
          </div>
          <p className="text-2xl font-bold text-warning tabular-nums">
            {formatBRL(aReceber)}
          </p>
        </div>

        {/* Barra de progresso do mês */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Meta do mês</span>
            <span className="font-medium text-foreground tabular-nums">{progresso}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progresso}%`,
                background: 'linear-gradient(90deg, var(--success), var(--info))',
              }}
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
