'use client'

import Link from 'next/link'
import { ArrowRight, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PartyPolo } from '@/types/legalProcess.types'
import { useProcessesByPartyPerson } from '../hooks/useLegalProcesses'
import type { PartyProcessRow } from '../services/legalProcesses.service'

const POLO_LABELS: Record<PartyPolo, string> = {
  ativo: 'Pólo Ativo',
  passivo: 'Pólo Passivo',
}

/** De quem é o processo — o cliente do card mestre, quando há. */
function ownerName(row: PartyProcessRow): string | null {
  const master =
    row.legal_process?.crm_items.find((item) => item.workflow_id === 'wf-processos') ??
    row.legal_process?.crm_items[0]
  const client = master?.client
  if (!client) return null
  if (client.type === 'individual') return client.name
  return client.trade_name ?? client.company_name
}

/**
 * Processos em que o cadastro aparece como parte — aba da ficha de pessoa
 * (migration 78). A parte contrária cadastrada uma vez é ligada sozinha em
 * todo processo importado depois (`resolvePartyClients`), e é aqui que isso
 * aparece.
 */
export function PartyProcessesTab({ personId }: { personId: string }) {
  const { data: rows = [], isLoading } = useProcessesByPartyPerson(personId)

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  const visible = rows.filter((row) => row.legal_process)

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <Scale className="h-7 w-7" />
        <p className="text-sm font-medium">Não é parte em nenhum processo</p>
        <p className="text-xs">
          Vincule a pessoa a uma parte na página do processo e ela aparece aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <span className="block pb-1 text-xs text-muted-foreground">
        {visible.length} participaç{visible.length !== 1 ? 'ões' : 'ão'} em processos
      </span>
      {visible.map((row) => {
        const process = row.legal_process!
        const owner = ownerName(row)
        return (
          <Link
            key={row.id}
            href={`/processos/${process.id}`}
            className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate font-mono">
                {process.cnj_number ?? 'Processo sem número'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[
                  row.party_type,
                  process.court,
                  owner ? `cliente: ${owner}` : 'sem cliente',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                row.polo === 'ativo'
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              )}
            >
              {POLO_LABELS[row.polo]}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        )
      })}
    </div>
  )
}
