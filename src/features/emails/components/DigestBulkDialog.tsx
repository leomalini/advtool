'use client'

import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DIGEST_BLOCKER_LABELS,
  type DigestBlocker,
  type DigestBulkSummary,
} from '@/types/emailMessage.types'
import type { DigestBulkFilter } from '../services/digest.service'
import { useDigestBulkPreview, useEnableDigestBulk } from '../hooks/useDigestSubscription'

interface DigestBulkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O recorte que a lista mostra agora: busca e área. */
  filter: DigestBulkFilter
  /** O recorte em palavras, para a pessoa saber a quem está ligando. */
  filterLabel: string
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Ligar o resumo diário para o recorte da lista de Clientes.
 *
 * Abre com a prévia — quantos estão no recorte, quantos já recebem, quantos
 * pediram para sair e por que os demais não podem — e só liga no clique.
 * Quem pediu para sair nunca é religado daqui.
 */
export function DigestBulkDialog({ open, onOpenChange, filter, filterLabel }: DigestBulkDialogProps) {
  const preview = useDigestBulkPreview(filter, open)
  const enable = useEnableDigestBulk()
  const summary = preview.data

  async function handleEnable() {
    try {
      const result = await enable.mutateAsync(filter)
      toast.success(`Resumo ligado para ${plural(result.enabled ?? 0, 'cliente', 'clientes')}.`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ligar o resumo.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resumo diário por e-mail</DialogTitle>
          <DialogDescription>
            Para {filterLabel}. Quem estiver ligado recebe às 18h, nos dias com decisão, audiência,
            recurso ou encerramento visíveis no portal, um e-mail com o tipo e a data de cada ato e o
            link de acompanhamento.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : preview.error || !summary ? (
          <p className="text-sm text-destructive">
            {preview.error instanceof Error ? preview.error.message : 'Não foi possível calcular.'}
          </p>
        ) : (
          <SummaryList summary={summary} />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enable.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnable}
            disabled={enable.isPending || !summary || summary.eligible === 0}
          >
            {enable.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {summary && summary.eligible > 0
              ? `Ligar para ${plural(summary.eligible, 'cliente', 'clientes')}`
              : 'Ninguém para ligar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryList({ summary }: { summary: DigestBulkSummary }) {
  const blocked = Object.entries(summary.blocked) as [DigestBlocker, number][]

  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        <li>
          <strong>{summary.eligible}</strong> podem ser ligados agora
        </li>
        <li className="text-muted-foreground">
          {plural(summary.alreadyEnabled, 'já recebe', 'já recebem')}
        </li>
        {summary.optedOut > 0 && (
          <li className="text-muted-foreground">
            {plural(summary.optedOut, 'pediu', 'pediram')} para não receber — só religa na ficha
          </li>
        )}
      </ul>

      {blocked.length > 0 && (
        <div className="space-y-1 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium">Ficam de fora:</p>
          <ul className="space-y-0.5">
            {blocked.map(([blocker, count]) => (
              <li key={blocker} className="text-xs text-muted-foreground">
                {count} · {DIGEST_BLOCKER_LABELS[blocker]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {plural(summary.total, 'cliente', 'clientes')} no recorte.
        {summary.truncated &&
          ' A lista passou de 1.000 — só os 1.000 mais recentes entram. Filtre por área para pegar o resto.'}
      </p>
    </div>
  )
}
