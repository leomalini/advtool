'use client'

import { useState } from 'react'
import { Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AI_ROUTE_LABELS } from '@/features/ia/config/models'
import { aiBudgetUsdSchema } from '@/schemas/aiSettings.schema'
import type { AiBudgetSummary, AiMonthUsage, AiSettingsSummary } from '@/types/aiSettings.types'
import { useAiMonthUsage, useSaveAiBudget } from '../hooks/useAiSettings'
import { formatUsd } from '../utils/aiSettingsText'
import { StatusRow } from './StatusRow'

const MONTH_NAME = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

/** O gasto do mês contra o teto, o teto e o gasto por função. */
export function AiBudgetCard({
  summary,
  canEdit,
}: {
  summary: AiSettingsSummary
  canEdit: boolean
}) {
  const usage = useAiMonthUsage()
  const { budget } = summary

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Gasto e teto
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Estimado pelo AdvTool com a tabela de preços de cada modelo. A fatura oficial fica no
          painel do provedor.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {usage.isLoading && <Skeleton className="h-16 w-full" />}
        {usage.error && (
          <StatusRow ok={false} title="Gasto do mês indisponível">
            {usage.error instanceof Error ? usage.error.message : 'Tente recarregar.'}
          </StatusRow>
        )}
        {usage.data && <MonthTotal usage={usage.data} budget={budget} />}

        {budget.invalidEnv && (
          <StatusRow ok={false} title="Teto do ambiente inválido: a IA está parada">
            AI_MONTHLY_BUDGET_USD não é um número. Defina o teto aqui ou corrija a variável.
          </StatusRow>
        )}

        <BudgetForm key={`${budget.source}:${budget.limitUsd}`} budget={budget} canEdit={canEdit} />

        {usage.data && usage.data.byRoute.length > 0 && <RouteTable usage={usage.data} />}
      </CardContent>
    </Card>
  )
}

function MonthTotal({ usage, budget }: { usage: AiMonthUsage; budget: AiBudgetSummary }) {
  const month = MONTH_NAME.format(new Date(`${usage.month}T12:00:00`))
  const limit = budget.limitUsd
  const percent = limit ? Math.min(100, (usage.totalUsd / limit) * 100) : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">Gasto em {month}</p>
        <p className="text-xs text-muted-foreground">
          {usage.calls} {usage.calls === 1 ? 'chamada' : 'chamadas'}
        </p>
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        {formatUsd(usage.totalUsd)}
        {limit !== null && (
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
            de {formatUsd(limit)}
          </span>
        )}
      </p>
      {percent !== null && <Progress value={percent} aria-label="Gasto do mês contra o teto" />}
      {limit !== null && usage.totalUsd >= limit && (
        <StatusRow ok={false} title="Teto atingido: a IA está parada">
          Nada que gaste com a IA roda até o mês seguinte ou até o teto subir.
        </StatusRow>
      )}
      {usage.uncosted > 0 && (
        <p className="text-xs text-muted-foreground">
          {usage.uncosted} {usage.uncosted === 1 ? 'chamada' : 'chamadas'} sem preço conhecido
          (Gemini) ficam fora do total e do teto.
        </p>
      )}
    </div>
  )
}

type BudgetMode = 'env' | 'limit' | 'none'

function BudgetForm({ budget, canEdit }: { budget: AiBudgetSummary; canEdit: boolean }) {
  const save = useSaveAiBudget()
  const initialMode: BudgetMode =
    budget.source === 'env' ? 'env' : budget.limitUsd === null ? 'none' : 'limit'
  const [mode, setMode] = useState<BudgetMode>(initialMode)
  const [amount, setAmount] = useState(
    budget.source === 'panel' && budget.limitUsd !== null ? String(budget.limitUsd) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const failure = save.data && !save.data.ok ? save.data.message : null

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'env') return save.mutate({ source: 'env' })
    if (mode === 'none') return save.mutate({ source: 'panel', usd: null })

    const parsed = aiBudgetUsdSchema.safeParse(Number(amount.replace(',', '.')))
    if (!amount.trim() || !parsed.success) {
      setError(parsed.error?.issues[0]?.message ?? 'Informe o teto em US$.')
      return
    }
    setError(null)
    save.mutate({ source: 'panel', usd: parsed.data })
  }

  const envLabel =
    budget.source === 'env'
      ? `Usar o do ambiente (${budget.limitUsd !== null ? formatUsd(budget.limitUsd) : 'sem teto'})`
      : 'Usar o do ambiente (AI_MONTHLY_BUDGET_USD)'

  return (
    <form onSubmit={submit} className="space-y-2 border-t pt-4">
      <label htmlFor="ai-budget-mode" className="block text-xs text-muted-foreground">
        Teto mensal
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mode}
          onValueChange={(value) => {
            setMode(value as BudgetMode)
            setError(null)
            save.reset()
          }}
          disabled={!canEdit || save.isPending}
        >
          <SelectTrigger id="ai-budget-mode" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="limit">Definir aqui</SelectItem>
            <SelectItem value="none">Sem teto</SelectItem>
            <SelectItem value="env">{envLabel}</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'limit' && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">US$</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="50"
              className="h-9 w-28"
              aria-label="Teto mensal em US$"
              aria-invalid={error !== null}
              disabled={!canEdit || save.isPending}
            />
          </div>
        )}
        {canEdit && (
          <Button type="submit" size="sm" variant="outline" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar teto
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Atingido o teto, o Assistente, o portal e as tarefas em segundo plano param até o mês
        seguinte ou até o teto subir.
      </p>
      {(error ?? failure) && (
        <StatusRow ok={false} title="O teto não foi salvo">
          {error ?? failure}
        </StatusRow>
      )}
    </form>
  )
}

function RouteTable({ usage }: { usage: AiMonthUsage }) {
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-xs text-muted-foreground">Por função, neste mês</p>
      <div className="divide-y rounded-lg border text-sm">
        {usage.byRoute.map((entry) => (
          <div key={entry.route} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate">
              {AI_ROUTE_LABELS[entry.route as keyof typeof AI_ROUTE_LABELS] ?? entry.route}
            </span>
            <span className="flex shrink-0 flex-col items-end tabular-nums sm:flex-row sm:gap-2">
              {formatUsd(entry.costUsd)}
              <span className="text-xs text-muted-foreground">
                {entry.calls} {entry.calls === 1 ? 'chamada' : 'chamadas'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
