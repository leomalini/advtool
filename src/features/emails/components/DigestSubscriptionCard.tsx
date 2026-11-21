'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BellRing, CircleAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { DIGEST_BLOCKER_LABELS, type DigestSubscription } from '@/types/emailMessage.types'
import { useDigestSubscription, useSetDigestSubscription } from '../hooks/useDigestSubscription'

function formatDay(iso: string): string {
  return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

/**
 * A chave do resumo diário, no topo da aba E-mails da ficha do cliente.
 *
 * Mora aqui, e não na aba Cadastro, porque o `CadastroTab` é o mesmo da ficha
 * de pessoa — e pessoa que não é cliente não recebe resumo.
 *
 * Diz sempre o porquê: ligado para onde, pausado por quê, desligado pelo
 * próprio cliente quando.
 */
export function DigestSubscriptionCard({ clientId }: { clientId: string }) {
  const { data: subscription, isLoading, error } = useDigestSubscription(clientId)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">Resumo diário dos processos</p>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : error || !subscription ? (
            <p className="text-xs text-muted-foreground">
              Não foi possível carregar a situação do resumo. Confira se a migration 96 foi aplicada.
            </p>
          ) : (
            <SubscriptionBody clientId={clientId} subscription={subscription} />
          )}
        </div>
      </div>
    </div>
  )
}

function SubscriptionBody({
  clientId,
  subscription,
}: {
  clientId: string
  subscription: DigestSubscription
}) {
  const { can } = usePermissions()
  const canManage = can('clientes', 'update')
  const setSubscription = useSetDigestSubscription(clientId)
  const [confirmingRejoin, setConfirmingRejoin] = useState(false)

  const { enabledAt, optedOutAt, recipient, blockers } = subscription

  async function change(enabled: boolean) {
    try {
      await setSubscription.mutateAsync(enabled)
      setConfirmingRejoin(false)
      toast.success(enabled ? 'Resumo diário ligado.' : 'Resumo diário desligado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o resumo.')
    }
  }

  const reasons = blockers.length > 0 && (
    <ul className="space-y-0.5">
      {blockers.map((blocker) => (
        <li key={blocker} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden />
          {DIGEST_BLOCKER_LABELS[blocker]}
        </li>
      ))}
    </ul>
  )

  if (enabledAt) {
    return (
      <>
        <p className="text-xs text-muted-foreground">
          Ligado desde {formatDay(enabledAt)}
          {recipient ? ` · vai para ${recipient}` : ''}. Sai às 18h, só nos dias com decisão,
          audiência, recurso ou encerramento visíveis no portal.
        </p>
        {blockers.length > 0 && (
          <>
            <p className="text-xs font-medium text-warning">Pausado até resolver:</p>
            {reasons}
          </>
        )}
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => change(false)}
            disabled={setSubscription.isPending}
          >
            {setSubscription.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Desligar
          </Button>
        )}
      </>
    )
  }

  if (optedOutAt) {
    return (
      <>
        <p className="text-xs text-muted-foreground">
          Desligado pelo próprio cliente em {formatDay(optedOutAt)}, pelo link do e-mail.
        </p>
        {canManage && blockers.length === 0 && !confirmingRejoin && (
          <Button size="sm" variant="outline" onClick={() => setConfirmingRejoin(true)}>
            Religar
          </Button>
        )}
        {confirmingRejoin && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Religue só se o cliente pediu para voltar a receber. Ele pode sair de novo pelo link
              de qualquer resumo.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => change(true)} disabled={setSubscription.isPending}>
                {setSubscription.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Religar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingRejoin(false)}
                disabled={setSubscription.isPending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {reasons}
      </>
    )
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Desligado. Ligando, {recipient ?? 'o cliente'} recebe às 18h, nos dias com decisão,
        audiência, recurso ou encerramento, um e-mail com o tipo e a data de cada ato e o link do
        portal — o texto do tribunal fica no portal.
      </p>
      {reasons}
      {canManage && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => change(true)}
          disabled={setSubscription.isPending || blockers.length > 0}
        >
          {setSubscription.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Ligar
        </Button>
      )}
    </>
  )
}
