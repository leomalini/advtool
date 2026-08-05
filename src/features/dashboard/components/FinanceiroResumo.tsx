'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from 'lucide-react'
import { useFinancialSummary } from '@/features/financeiro/hooks/useFinancialEntries'

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function FinanceiroResumo() {
  const { data: summary, isLoading } = useFinancialSummary()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-success" />
          Financeiro do Mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <>
            <Skeleton className="h-[76px] w-full rounded-lg" />
            <Skeleton className="h-[76px] w-full rounded-lg" />
            <Skeleton className="h-[76px] w-full rounded-lg" />
          </>
        )}

        {/* Sem comparativo com o mês anterior nem "meta": não guardamos meta em
            lugar nenhum, e o número que existia antes era inventado no mock. */}
        {summary && (
          <>
            <div className="rounded-lg bg-success/10 border border-success/20 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-success font-medium">Recebido</span>
                <TrendingUp className="h-3 w-3 text-success" />
              </div>
              <p className="text-2xl font-bold text-success tabular-nums">
                {formatBRL(summary.receivedThisMonth)}
              </p>
            </div>

            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-destructive font-medium">Despesas</span>
                <TrendingDown className="h-3 w-3 text-destructive" />
              </div>
              <p className="text-2xl font-bold text-destructive tabular-nums">
                {formatBRL(summary.expensesThisMonth)}
              </p>
            </div>

            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-warning font-medium">A receber</span>
                {summary.overdue > 0 && (
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {formatBRL(summary.overdue)} vencido
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-warning tabular-nums">
                {formatBRL(summary.outstanding)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
