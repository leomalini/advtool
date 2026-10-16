'use client'

import { AlertTriangle, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/shared/Can'
import { FinancialEntriesTab } from '@/features/financeiro/components/FinancialEntriesTab'
import { useFinancialEntriesForEntity } from '@/features/financeiro/hooks/useFinancialEntries'
import type { ContractWithRelations } from '@/types/contract.types'
import { contractEntryKind, describeEntriesDivergence } from '../utils/contractEntries'

const OFFER_CLASS =
  'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3'

interface ContractFinanceSectionProps {
  contract: ContractWithRelations
  onOpenEntries: () => void
}

/**
 * Os lançamentos ligados ao contrato. Some no contrato do cliente com
 * terceiros, que não mexe no dinheiro do escritório.
 */
export function ContractFinanceSection({ contract, onOpenEntries }: ContractFinanceSectionProps) {
  const { data: entries = [], isLoading } = useFinancialEntriesForEntity({
    contractId: contract.id,
  })

  if (!contractEntryKind(contract.kind)) return null

  const divergence = describeEntriesDivergence(contract, entries)
  // A prévia é oferecida ao assinar; aqui ela fica à mão para quem pulou.
  const offerPreview = !isLoading && entries.length === 0 && contract.status === 'vigente'

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      {divergence && (
        <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            Os números do contrato mudaram depois dos lançamentos ({divergence}). Lançamentos
            não mudam sozinhos: corrija no Financeiro, se for o caso.
          </p>
        </div>
      )}

      {offerPreview && (
        <Can resource="financeiro" action="create">
          <div className={OFFER_CLASS}>
            <p className="text-xs text-muted-foreground">
              As parcelas e o êxito do contrato ainda não foram lançados.
            </p>
            <Button size="sm" variant="outline" onClick={onOpenEntries}>
              <Receipt className="h-3.5 w-3.5" />
              Lançar parcelas
            </Button>
          </div>
        </Can>
      )}

      <FinancialEntriesTab
        contractId={contract.id}
        lockedContractId={contract.id}
        lockedClientId={contract.client_id}
        lockedLegalProcessId={contract.legal_process_id}
        itemLabel="contrato"
      />
    </section>
  )
}
