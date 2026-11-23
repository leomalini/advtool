'use client'

import { Copy, MessageCircle, SkipForward } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { buildReminderMessage, greetingNameFor } from '@/lib/billing/messages'
import type { BillingMessage, BillingPanelItem } from '@/types/billing.types'
import { useRecordReminder, useUndoReminder } from '../hooks/usePaymentChargeMutations'
import { buildWhatsAppUrl } from '../utils/paymentLinkMessage'

/** O texto de "mandar de novo" segue o momento: antes, no dia ou depois do
 * vencimento. Só o sinal importa para `buildReminderMessage`. */
function resendTextStep(dueDate: string | null, today: string): string {
  if (!dueDate) return 'created'
  if (dueDate === today) return 'd0'
  return dueDate < today ? 'd+1' : 'd-1'
}

export interface ReminderOffice {
  officeName: string | null
  officePhone: string | null
}

/**
 * As ações sobre o aviso de uma cobrança: abrir o WhatsApp com a mensagem
 * pronta, copiá-la ou pular a etapa. Cada uma fica registrada
 * (`billing_messages`), com "Desfazer" no aviso da tela.
 *
 * `mode="due"`: o aviso devido hoje (`item.dueStep`). `mode="resend"`: mandar
 * de novo, fora da régua — registrado como reenvio, sem "Pular".
 *
 * O WhatsApp é aberto no navegador de quem clica: o sistema não sabe se a
 * mensagem saiu, e registra "aberto no WhatsApp", não "enviado".
 */
export function ReminderActions({
  item,
  office,
  today,
  mode = 'due',
  size = 'xs',
}: {
  item: BillingPanelItem
  office: ReminderOffice
  today: string
  mode?: 'due' | 'resend'
  size?: 'xs' | 'sm'
}) {
  const record = useRecordReminder()
  const undo = useUndoReminder()

  const step = mode === 'due' ? (item.dueStep?.step ?? null) : 'resend'
  if (!step) return null

  const message = buildReminderMessage({
    step: mode === 'due' ? step : resendTextStep(item.entry.due_date, today),
    greetingName: greetingNameFor(
      item.client ? { type: item.client.type, displayName: item.client.displayName } : null,
    ),
    officeName: office.officeName,
    officePhone: office.officePhone,
    description: item.billing.client_description,
    amount: item.entry.amount,
    dueDate: item.entry.due_date,
    url: item.url,
  })
  const whatsAppUrl = buildWhatsAppUrl(item.recipientPhone, message)
  // O vencimento da época vai junto: se ele mudar, a régua recomeça.
  const dueDate = item.entry.due_date ?? today

  function register(status: 'manual' | 'skipped', done: string) {
    if (!step) return
    record.mutate(
      { billingId: item.billing.id, step, dueDate, status },
      {
        onSuccess: (saved: BillingMessage) =>
          toast.success(done, {
            // Mais tempo que o padrão: é o único lugar do "Desfazer".
            duration: 10_000,
            action: { label: 'Desfazer', onClick: () => undo.mutate(saved.id) },
          }),
      },
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      register('manual', 'Mensagem copiada e registrada.')
    } catch {
      toast.error('Não foi possível copiar a mensagem.')
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button type="button" size={size} variant="outline" asChild>
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => register('manual', 'Registrado: aberto no WhatsApp.')}
        >
          <MessageCircle />
          {mode === 'due' ? 'WhatsApp' : 'Mandar de novo'}
        </a>
      </Button>
      <Button
        type="button"
        size={size}
        variant="ghost"
        disabled={record.isPending}
        onClick={() => void copy()}
      >
        <Copy />
        Copiar mensagem
      </Button>
      {mode === 'due' && (
        <Button
          type="button"
          size={size}
          variant="ghost"
          className="text-muted-foreground"
          disabled={record.isPending}
          onClick={() => register('skipped', 'Aviso pulado.')}
        >
          <SkipForward />
          Pular
        </Button>
      )}
    </div>
  )
}
