'use client'

import { Coins } from 'lucide-react'
import { BLOCK_BODY, DashboardCard } from './DashboardCard'
import { CreditBalanceDetails } from './CreditBalanceDetails'

interface CreditBalanceCardProps {
  className?: string
}

/**
 * The BuscaProcessos credit balance on its own card, in the side column.
 * Gated on `configuracoes:view` — the permission of the route — so the query
 * never runs for a role that would get a 403.
 */
export function CreditBalanceCard({ className }: CreditBalanceCardProps) {
  return (
    <DashboardCard
      icon={Coins}
      tone="accent"
      title="Créditos da API"
      subtitle="BuscaProcessos"
      className={className}
      bodyClassName={BLOCK_BODY}
    >
      <CreditBalanceDetails />
    </DashboardCard>
  )
}
