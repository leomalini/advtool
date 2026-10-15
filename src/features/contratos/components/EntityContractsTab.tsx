'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileSignature, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/shared/Can'
import {
  CONTRACT_KIND_LABELS,
  type ContractWithRelations,
} from '@/types/contract.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { formatDate } from '@/utils/date'
import { useContractsForEntity } from '../hooks/useContracts'
import { ContractFormDialog } from './ContractFormDialog'
import { ContractSituationBadge } from './ContractSituationBadge'

interface EntityContractsTabProps {
  clientId?: string | null
  legalProcessId?: string | null
  /** Cliente que o contrato novo já leva — no processo, o dono do card. */
  defaultClientId?: string | null
  /** O que a aba é: "cliente" ou "processo". */
  itemLabel: string
}

function term(contract: ContractWithRelations): string | null {
  if (contract.start_date && contract.end_date) {
    return `${formatDate(contract.start_date)} – ${formatDate(contract.end_date)}`
  }
  if (contract.end_date) return `até ${formatDate(contract.end_date)}`
  return null
}

/** Aba Contratos do cliente e do processo, com "Novo contrato" já ligado a ele. */
export function EntityContractsTab({
  clientId,
  legalProcessId,
  defaultClientId,
  itemLabel,
}: EntityContractsTabProps) {
  const { data: contracts = [], isLoading } = useContractsForEntity({ clientId, legalProcessId })
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Contratos</h3>
          {contracts.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {contracts.length}
            </span>
          )}
        </div>
        <Can resource="contratos" action="create">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo contrato
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <FileSignature className="h-7 w-7" />
          <p className="text-sm">Nenhum contrato deste {itemLabel}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {contracts.map((contract) => {
            const isParty = !!clientId && contract.client_id !== clientId && !legalProcessId
            return (
              <li key={contract.id}>
                <Link
                  href={`/contratos/${contract.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{contract.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        CONTRACT_KIND_LABELS[contract.kind],
                        isParty ? 'é parte' : null,
                        contract.total_amount !== null
                          ? formatCurrency(contract.total_amount)
                          : null,
                        term(contract),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ContractSituationBadge contract={contract} bordered />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <ContractFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialValues={{
          client_id: clientId ?? defaultClientId ?? '',
          legal_process_id: legalProcessId ?? '',
        }}
      />
    </div>
  )
}
