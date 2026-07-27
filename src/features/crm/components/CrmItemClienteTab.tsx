'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, ExternalLink, Link2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useClientes, useCliente } from '@/features/clientes/hooks/useClientes'
import { getClientDisplayName } from '@/types/cliente.types'
import { ClienteResumo } from '@/features/clientes/components/ClienteResumo'
import type { CrmItemClientSummary } from '@/types/crmItem.types'

interface CrmItemClienteTabProps {
  client: CrmItemClientSummary | null
  /** Called with the chosen client id — omit to hide the "Vincular Cliente" affordance entirely. */
  onLinkClient?: (clientId: string) => void
  isLinking?: boolean
}

/** Client tab — shared between the CRM case modal and the Processo modal so both stay identical.
 * Mirrors the client detail modal's Resumo tab, plus a link back to the full client record. */
export function CrmItemClienteTab({ client, onLinkClient, isLinking }: CrmItemClienteTabProps) {
  const [picking, setPicking] = useState(false)
  const { data: clients = [] } = useClientes()
  const { data: fullClient, isLoading } = useCliente(client?.id ?? '')

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Building2 className="w-8 h-8" />
        <p className="text-sm">Nenhum cliente vinculado</p>

        {onLinkClient && (
          picking ? (
            <div className="flex items-center gap-2 w-full max-w-xs">
              <Select onValueChange={(v) => { onLinkClient(v as string); setPicking(false) }}>
                <SelectTrigger className="h-9 flex-1 text-sm">
                  <SelectValue placeholder="Selecionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {getClientDisplayName(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setPicking(false)}
                disabled={isLinking}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setPicking(true)}>
              <Link2 className="w-3.5 h-3.5 mr-1.5" />
              Vincular Cliente
            </Button>
          )
        )}
      </div>
    )
  }

  if (isLoading || !fullClient) {
    return <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
  }

  return (
    <div className="space-y-3">
      <Link
        href={`/clientes?id=${client.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-foreground hover:underline w-fit"
      >
        Ver detalhes completos do cliente
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      <ClienteResumo cliente={fullClient} />
    </div>
  )
}
