'use client'

import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRecentMovements } from '../hooks/useLegalProcesses'

/**
 * O DIA do ato, sem hora. `movement_date` é `timestamptz`, mas a API só informa
 * a data — ver `formatMovementDate` em ProcessoDetailPage, mesmo motivo: montar
 * um Date a partir do carimbo completo trazia uma hora inventada e o dia
 * anterior ao que o tribunal registrou.
 */
function formatMovementDate(dateStr: string): string {
  const [year, month, day] = dateStr.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Nome do cliente, ou null quando a parte não é cliente cadastrado — o nulo
 * é o que permite omitir a linha em vez de imprimir '(sem cliente)'. */
function getClientName(client: {
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
} | null): string | null {
  if (!client) return null
  if (client.type === 'individual') return client.name
  return client.trade_name ?? client.company_name
}

interface MovimentacoesFeedProps {
  onSelectProcess: (legalProcessId: string) => void
}

export function MovimentacoesFeed({ onSelectProcess }: MovimentacoesFeedProps) {
  const { data: movements = [], isLoading } = useRecentMovements(30)

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Movimentações recentes</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/40" />
            ))}
          </div>
        )}

        {!isLoading && movements.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-6 text-center">
            <Activity className="w-6 h-6" />
            <p className="text-xs">Nenhuma movimentação registrada ainda.</p>
          </div>
        )}

        <div className="divide-y divide-border">
          {movements.map((m) => {
            const masterItem =
              m.legal_process.crm_items.find((i) => i.workflow_id === 'wf-processos') ??
              m.legal_process.crm_items[0]
            const clientName = getClientName(masterItem?.client ?? null)
            // O que identifica a movimentação é o processo: o CNJ primeiro, o
            // título do card quando não há número. O cliente vira linha de
            // apoio e some quando não existe — antes ele ocupava o destaque e
            // um processo sem cliente aparecia como '(sem cliente)' em negrito.
            const processoLabel =
              m.legal_process.cnj_number ?? masterItem?.title?.trim() ?? null
            const tribunal =
              m.legal_process.court ?? (m.source === 'manual' ? 'Manual' : null)
            return (
              <button
                key={m.id}
                onClick={() => onSelectProcess(m.legal_process.id)}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={cn(
                      'truncate text-[13px] font-semibold text-foreground',
                      m.legal_process.cnj_number && 'font-mono text-[12px]',
                    )}
                  >
                    {processoLabel ?? 'Processo sem número'}
                  </span>
                  {/* O tribunal diz de onde o ato veio; "BuscaProcessos" só
                      dizia por qual integração ele entrou, que é a mesma para
                      quase tudo e não ajuda a distinguir uma linha da outra.
                      Lançamento manual continua marcado, porque aí a origem é
                      a informação relevante. */}
                  {tribunal && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {tribunal}
                    </span>
                  )}
                </div>
                {clientName && (
                  <p className="text-[10.5px] text-muted-foreground truncate">{clientName}</p>
                )}
                <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{m.description}</p>
                <p className="text-[10.5px] text-muted-foreground mt-1">
                  {formatMovementDate(m.movement_date)}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
