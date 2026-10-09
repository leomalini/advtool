'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { useCreditBalance } from '../hooks/useDashboardStats'
import { creditStatus, formatCredits, type CreditStatus } from '../utils/creditBalance'
import { DOT_TONES, TEXT_TONES } from '../utils/statusTones'

const HINT_TONES: Record<CreditStatus['tone'], string> = {
  success: 'bg-success/8 text-success',
  warning: 'bg-warning/8 text-warning',
  danger: 'bg-destructive/8 text-destructive',
}

const REFRESH_BUTTON =
  'inline-flex items-center gap-1 rounded-sm font-semibold text-foreground hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:pointer-events-none disabled:opacity-60'

/**
 * The BuscaProcessos credit balance in full: the amount, the account status,
 * what a low balance means and when it was read — with a button to read it
 * now. The body of the card and of the pill's popover; both sit on the same
 * query, so opening the popover doesn't call the API again.
 */
export function CreditBalanceDetails() {
  const { data: balance, error, isLoading, isFetching, refetch } = useCreditBalance()

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
    )
  }

  const status = balance ? creditStatus(balance) : null

  return (
    <div className="space-y-2.5">
      {balance && status ? (
        <div>
          {/* Ink only when the amount is the problem: a healthy balance is
              just a number. */}
          <p
            className={cn(
              'text-2xl font-bold tracking-tight tabular-nums',
              status.amountAtFault && TEXT_TONES[status.tone]
            )}
          >
            {formatCredits(balance.credits, balance.currency)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT_TONES[status.tone])} />
            {status.label}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Saldo indisponível</p>
          <p className="text-xs text-muted-foreground">
            {error?.message ?? 'Não foi possível ler o saldo de créditos.'}
          </p>
        </div>
      )}

      {status?.hint && (
        <p className={cn('flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs', HINT_TONES[status.tone])}>
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          {status.hint}
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {balance && (
          <>
            <span>
              Lido <time dateTime={balance.checkedAt}>{formatRelative(balance.checkedAt)}</time>
              {/* The amount above is the last good reading, not this one. */}
              {error && ' · a nova leitura falhou'}
            </span>
            <span aria-hidden>·</span>
          </>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className={REFRESH_BUTTON}
        >
          <RefreshCw
            aria-hidden
            className={cn('size-3.5', isFetching && 'motion-safe:animate-spin')}
          />
          {isFetching ? 'Atualizando…' : balance ? 'Atualizar' : 'Tentar de novo'}
        </button>
      </p>
    </div>
  )
}
