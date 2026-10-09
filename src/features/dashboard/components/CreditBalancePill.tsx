'use client'

import { ChevronDown, Coins } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CreditBalance } from '@/lib/buscaprocessos/creditBalance'
import { useCreditBalance } from '../hooks/useDashboardStats'
import { creditStatus, formatCredits } from '../utils/creditBalance'
import { PILL_TONES, STATUS_PILL, TEXT_TONES, type StatusTone } from '../utils/statusTones'
import { CreditBalanceDetails } from './CreditBalanceDetails'

/** The amount, and what is wrong with it when something is. */
function summarize(
  balance: CreditBalance | undefined,
  failed: boolean
): { tone: StatusTone; label: string } {
  if (!balance) return { tone: 'muted', label: failed ? 'Saldo indisponível' : 'Sem dados' }

  const status = creditStatus(balance)
  const amount = formatCredits(balance.credits, balance.currency)
  return {
    tone: status.tone,
    label: status.tone === 'success' ? amount : `${amount} · ${status.label.toLowerCase()}`,
  }
}

/**
 * The credit balance next to the deliveries pill, in the monitoring card's
 * header — the monitoring is what spends it. Details in a popover, the same
 * ones the "Créditos da API" card shows. Rendered only for
 * `configuracoes:view`, the permission of the route behind it.
 */
export function CreditBalancePill() {
  const { data: balance, isLoading, isError } = useCreditBalance()

  if (isLoading) return <Skeleton className="h-7 w-28 rounded-full" />

  const { tone, label } = summarize(balance, isError)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Créditos da BuscaProcessos: ${label}`}
          className={cn(STATUS_PILL, PILL_TONES[tone])}
        >
          <Coins aria-hidden className={cn('size-3.5 shrink-0', TEXT_TONES[tone])} />
          <span className="truncate tabular-nums">{label}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Coins aria-hidden className="size-4 text-muted-foreground" />
          Créditos da BuscaProcessos
        </p>
        <CreditBalanceDetails />
      </PopoverContent>
    </Popover>
  )
}
