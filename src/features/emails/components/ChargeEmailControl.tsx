'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EMAIL_KIND_LABELS } from '@/types/emailMessage.types'
import { useChargeEmailMessages, useEmailConfigured } from '../hooks/useEmailMessages'
import { useSendChargeLinkEmail } from '../hooks/useEmailMutations'
import { EmailStatusBadge } from './EmailStatusBadge'

interface ChargeEmailControlProps {
  chargeId: string
  /** Para onde iria — a mesma regra da rota (`pickClientEmail`). */
  recipient: string | null
  /** `financeiro:create`, a permissão de gerar o link. */
  canSend: boolean
}

/** Quantas linhas do histórico cabem no cartão do link. */
const VISIBLE_HISTORY = 3

/**
 * O envio do link de pagamento por e-mail, no cartão do link em aberto, ao
 * lado do WhatsApp — e o que já saiu desta cobrança (link, lembretes,
 * confirmação), com o status de entrega.
 *
 * A confirmação embutida diz o que muda: com o link por e-mail, esta cobrança
 * passa a ter lembrete e confirmação automáticos (docs/emails-clientes.md).
 */
export function ChargeEmailControl({ chargeId, recipient, canSend }: ChargeEmailControlProps) {
  const { data: configured = false } = useEmailConfigured()
  const { data: messages = [] } = useChargeEmailMessages(chargeId)
  const send = useSendChargeLinkEmail(chargeId)
  const [confirming, setConfirming] = useState(false)

  const blocker = !configured
    ? 'O envio de e-mail não está configurado (Configurações → E-mail).'
    : !recipient
      ? 'O cadastro do cliente não tem um e-mail válido.'
      : null

  async function handleSend() {
    try {
      const message = await send.mutateAsync()
      setConfirming(false)
      toast.success(
        message.sandbox_to
          ? `Modo de teste: o e-mail foi para ${message.sandbox_to}, não para o cliente.`
          : `Link enviado para ${message.to_address}.`,
      )
    } catch (error) {
      setConfirming(false)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar o link por e-mail.')
    }
  }

  return (
    <div className="space-y-2">
      {messages.length > 0 && (
        <ul className="space-y-1">
          {messages.slice(0, VISIBLE_HISTORY).map((message) => (
            <li key={message.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <Mail className="h-3 w-3" aria-hidden />
              <span>{EMAIL_KIND_LABELS[message.kind]}</span>
              <span className="tabular-nums">
                {format(parseISO(message.created_at), 'dd/MM HH:mm', { locale: ptBR })}
              </span>
              <EmailStatusBadge status={message.status} />
              {message.sandbox_to && <span>(teste)</span>}
            </li>
          ))}
        </ul>
      )}

      {canSend && confirming && recipient && (
        <div className="space-y-2 rounded-md bg-muted/40 p-2.5">
          <p className="text-xs">
            Enviar para {recipient}? Com o link por e-mail, o cliente recebe também um lembrete
            até 3 dias antes do vencimento, outro se ele passar, e a confirmação quando pagar.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="xs" disabled={send.isPending} onClick={() => void handleSend()}>
              {send.isPending && <Loader2 className="animate-spin" />}
              Enviar
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={send.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {canSend && !confirming && (
        <div className="space-y-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={blocker !== null}
            onClick={() => setConfirming(true)}
          >
            <Mail />
            {messages.some((message) => message.kind === 'payment_link') ? 'Reenviar por e-mail' : 'E-mail'}
          </Button>
          {/* O motivo à vista, não num tooltip: no celular não há hover. */}
          {blocker && <p className="text-[11px] text-muted-foreground">{blocker}</p>}
        </div>
      )}
    </div>
  )
}
