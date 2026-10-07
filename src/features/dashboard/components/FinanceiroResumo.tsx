'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from 'lucide-react'
import { useFinancialSummary } from '@/features/financeiro/hooks/useFinancialEntries'
import { formatWholeBRL } from '../utils/format'

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
                {formatWholeBRL(summary.receivedThisMonth)}
              </p>
            </div>

            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-destructive font-medium">Despesas</span>
                <TrendingDown className="h-3 w-3 text-destructive" />
              </div>
              <p className="text-2xl font-bold text-destructive tabular-nums">
                {formatWholeBRL(summary.expensesThisMonth)}
              </p>
            </div>

            {/* "A receber" é o total — a vencer + vencido + condição especial.
                As duas parcelas que mudam a leitura do número aparecem ao lado
                dele, não escondidas atrás de um clique. */}
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-warning font-medium">A receber</span>
                {summary.receivableOverdue > 0 && (
                  <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {formatWholeBRL(summary.receivableOverdue)} vencido
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-warning tabular-nums">
                {formatWholeBRL(summary.receivableTotal)}
              </p>
              {summary.receivableConditionalCount > 0 && (
                <p className="text-[11px] text-info mt-1">
                  {formatWholeBRL(summary.receivableConditional)} em condição especial
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
