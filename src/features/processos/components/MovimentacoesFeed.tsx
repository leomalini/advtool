'use client'

import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRecentMovements } from '../hooks/useLegalProcesses'

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getClientName(client: {
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
} | null): string {
  if (!client) return '(sem cliente)'
  if (client.type === 'individual') return client.name ?? '(sem nome)'
  return client.trade_name ?? client.company_name ?? '(sem nome)'
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
            return (
              <button
                key={m.id}
                onClick={() => onSelectProcess(m.legal_process.id)}
                className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] font-semibold text-foreground truncate">{clientName}</span>
                  <span
                    className={cn(
                      'shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium',
                      m.source === 'busca_processos'
                        ? 'bg-info/15 text-info'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {m.source === 'busca_processos' ? 'BuscaProcessos' : 'Manual'}
                  </span>
                </div>
                {m.legal_process.cnj_number && (
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    {m.legal_process.cnj_number}
                  </p>
                )}
                <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{m.description}</p>
                <p className="text-[10.5px] text-muted-foreground mt-1">{formatDateTime(m.movement_date)}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
