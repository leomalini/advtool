'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getFinancialEntryById } from '@/features/financeiro/services/financialEntries.service'
import { formatCurrency, type FinancialEntryWithRelations } from '@/types/financialEntry.types'
import { LIVE_CHARGE_STATUSES } from '@/types/paymentCharge.types'
import type { ActionInput, ActionOutput } from '../tools/actions'
import { ReinforcedActionFooter } from './ReinforcedActionFooter'

interface PaymentLinkActionCardProps {
  input: ActionInput<'gerar_link_pagamento'>
  state: 'pending' | 'running' | 'done'
  output?: ActionOutput
  onConfirm: () => void
  onCancel: () => void
}

/** O que a rota recusaria, dito antes — a rota confere de novo. */
function blockedReason(entry: FinancialEntryWithRelations | null): string | null {
  if (!entry) return 'lançamento não encontrado ou sem acesso'
  if (entry.type !== 'receita') return 'só receita gera link de pagamento'
  if (entry.status !== 'pendente') return 'o lançamento não está pendente'
  if (entry.payment_charges?.some((charge) => LIVE_CHARGE_STATUSES.includes(charge.status))) {
    return 'já há um link ativo para este lançamento'
  }
  return null
}

function clientName(entry: FinancialEntryWithRelations): string | null {
  const client = entry.client
  if (!client) return null
  return client.type === 'company'
    ? (client.trade_name ?? client.company_name)
    : client.name
}

/**
 * O link de pagamento da InfinitePay proposto pela IA. O card mostra o
 * lançamento como está no banco (não os rótulos do modelo) e, gerado, o link
 * para copiar. Nada vai para o cliente sozinho.
 */
export function PaymentLinkActionCard({
  input,
  state,
  output,
  onConfirm,
  onCancel,
}: PaymentLinkActionCardProps) {
  const [copied, setCopied] = useState(false)
  const entry = useQuery({
    queryKey: ['ia', 'payment-entry', input.lancamento_id],
    queryFn: () => getFinancialEntryById(input.lancamento_id),
    enabled: state !== 'done',
    staleTime: 0,
  })

  const data = entry.data ?? null
  const blocked = entry.error
    ? 'não foi possível ler o lançamento'
    : entry.isLoading
      ? null
      : blockedReason(data)
  const link = output?.ok ? output.link : undefined

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('[ia] copy failed:', err)
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <CreditCard className="h-4 w-4" />
        Gerar link de pagamento (InfinitePay)
      </p>

      {entry.isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Conferindo o lançamento…
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Lançamento</dt>
          <dd className="break-words">{data?.description ?? input.lancamento_descricao}</dd>
          {data && clientName(data) && (
            <>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd>{clientName(data)}</dd>
            </>
          )}
          {data && (
            <>
              <dt className="text-muted-foreground">Valor</dt>
              <dd>{formatCurrency(Number(data.amount))}</dd>
            </>
          )}
          {data?.due_date && (
            <>
              <dt className="text-muted-foreground">Vencimento</dt>
              <dd>{data.due_date.slice(0, 10).split('-').reverse().join('/')}</dd>
            </>
          )}
        </dl>
      )}

      <ReinforcedActionFooter
        state={state}
        output={output}
        blockedReason={blocked}
        loading={entry.isLoading}
        warning="Gera na InfinitePay um link de pagamento deste valor, ativo até ser pago ou cancelado. Nada é enviado ao cliente: o link aparece aqui e no lançamento, para você mandar."
        confirmLabel="Gerar link"
        onConfirm={onConfirm}
        onCancel={onCancel}
        done={
          link ? (
            <div className="space-y-1">
              <p>Link gerado. Mande para o cliente:</p>
              <p className="break-all rounded border bg-background/60 px-2 py-1 font-mono text-xs text-foreground">
                {link}
              </p>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copiado' : 'Copiar link'}
              </button>
            </div>
          ) : (
            'Link gerado: está no lançamento.'
          )
        }
      />
    </div>
  )
}
