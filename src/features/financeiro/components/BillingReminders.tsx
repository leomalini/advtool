'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BellOff, BellRing, Loader2, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { officeDateOf } from '@/lib/billing/officeTime'
import { describeStep, remindersRunning } from '@/lib/billing/schedule'
import { BILLING_MESSAGE_STATUS_LABELS, type BillingPanelItem } from '@/types/billing.types'
import { useUpdateBilling } from '../hooks/usePaymentChargeMutations'
import type { BillingChanges } from '../services/billings.service'
import { BillingStateBadge } from './BillingsPanel'
import { ReminderActions } from './ReminderActions'

/** Quantos registros o detalhe mostra; o resto fica no banco. */
const TIMELINE_ROWS = 8

function shortDate(isoDate: string): string {
  return format(parseISO(isoDate), 'dd/MM', { locale: ptBR })
}

function shortMoment(iso: string): string {
  return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR })
}

/** +5527999991234 → (27) 99999-1234. */
function formatPhone(e164: string): string {
  const digits = e164.replace(/^\+55/, '')
  const area = digits.slice(0, 2)
  const local = digits.slice(2)
  const split = local.length - 4
  return `(${area}) ${local.slice(0, split)}-${local.slice(split)}`
}

/**
 * Os lembretes de uma cobrança, no detalhe do lançamento (fase 2 de
 * docs/cobrancas.md): ligar e desligar, o aviso de hoje, pausar, o telefone,
 * o cliente que não quer receber e o que já foi feito.
 */
export function BillingReminders({
  item,
  officeName,
  officePhone,
  canUpdate,
}: {
  item: BillingPanelItem
  officeName: string | null
  officePhone: string | null
  canUpdate: boolean
}) {
  const update = useUpdateBilling()
  const [editingPhone, setEditingPhone] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState('')
  const today = officeDateOf(new Date())
  const { billing } = item
  const hasDueDate = item.entry.settlement_kind === 'scheduled' && !!item.entry.due_date

  function change(changes: BillingChanges, done: string, after?: () => void) {
    update.mutate(
      { entryId: item.entry.id, changes },
      {
        onSuccess: () => {
          toast.success(done)
          after?.()
        },
      },
    )
  }

  if (!billing.reminders_enabled) {
    return (
      <div className="space-y-1.5 rounded-lg border border-dashed p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BellOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Lembretes desligados
        </p>
        {hasDueDate ? (
          canUpdate && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={update.isPending}
              onClick={() => change({ reminders: true }, 'Lembretes ligados.')}
            >
              {update.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
              Cobrar automaticamente
            </Button>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            Lembretes precisam de vencimento: a régua conta os dias a partir dele.
          </p>
        )}
      </div>
    )
  }

  const running = remindersRunning(item.state)
  const timeline = item.messages.slice(0, TIMELINE_ROWS)

  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BellRing className="h-3.5 w-3.5 text-info" aria-hidden />
          Lembretes
          <BillingStateBadge state={item.state} />
        </p>
        {canUpdate && (
          <div className="flex gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={update.isPending}
              onClick={() =>
                billing.paused_at
                  ? change({ paused: false }, 'Lembretes retomados.')
                  : change({ paused: true }, 'Lembretes pausados.')
              }
            >
              {billing.paused_at ? <Play /> : <Pause />}
              {billing.paused_at ? 'Retomar' : 'Pausar'}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              disabled={update.isPending}
              onClick={() => change({ reminders: false }, 'Lembretes desligados.')}
            >
              <BellOff />
              Desligar
            </Button>
          </div>
        )}
      </div>

      {item.dueStep && (
        <div className="space-y-1.5 rounded-md bg-warning/5 p-2.5">
          <p className="text-xs font-medium">Hoje: {describeStep(item.dueStep.step).toLowerCase()}</p>
          {canUpdate && (
            <ReminderActions item={item} office={{ officeName, officePhone }} today={today} />
          )}
        </div>
      )}
      {!item.dueStep && running && canUpdate && (
        <ReminderActions
          item={item}
          office={{ officeName, officePhone }}
          today={today}
          mode="resend"
        />
      )}
      {item.nextStep && (
        <p className="text-xs text-muted-foreground">
          Próximo aviso: {describeStep(item.nextStep.step).toLowerCase()}, em{' '}
          {shortDate(item.nextStep.date)}.
        </p>
      )}

      <div className="space-y-1 text-xs">
        {editingPhone ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={phoneDraft}
              onChange={(event) => setPhoneDraft(event.target.value)}
              placeholder="(27) 99999-1234"
              aria-label="Celular dos lembretes"
              className="h-7 w-44 text-xs"
            />
            <Button
              type="button"
              size="xs"
              disabled={update.isPending || !phoneDraft.trim()}
              onClick={() =>
                change({ recipientPhone: phoneDraft }, 'Telefone trocado.', () =>
                  setEditingPhone(false),
                )
              }
            >
              Salvar
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setEditingPhone(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <p>
            <span className="text-muted-foreground">Enviar para: </span>
            {item.recipientPhone ? formatPhone(item.recipientPhone) : 'sem celular no cadastro'}
            {billing.recipient_phone && <span className="text-muted-foreground"> (desta cobrança)</span>}
            {canUpdate && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setPhoneDraft('')
                    setEditingPhone(true)
                  }}
                >
                  trocar
                </button>
                {billing.recipient_phone && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="underline"
                      disabled={update.isPending}
                      onClick={() =>
                        change({ recipientPhone: null }, 'Voltou ao celular do cliente.')
                      }
                    >
                      usar o do cliente
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        )}

        {item.client && canUpdate && (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={item.client.optedOut}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                change(
                  { clientOptOut: checked === true },
                  checked === true
                    ? 'Registrado: o cliente não recebe lembretes.'
                    : 'O cliente volta a receber lembretes.',
                )
              }
            />
            <span>O cliente pediu para não receber lembretes (vale para todas as cobranças dele)</span>
          </label>
        )}
      </div>

      {timeline.length > 0 && (
        <ul className="space-y-0.5 border-t pt-2 text-[11px] text-muted-foreground">
          {timeline.map((message) => (
            <li key={message.id}>
              {shortMoment(message.created_at)} — {describeStep(message.step)}:{' '}
              {BILLING_MESSAGE_STATUS_LABELS[message.status].toLowerCase()}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
