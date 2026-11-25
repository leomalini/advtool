'use client'

import { useState } from 'react'
import { Loader2, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { hasLateCharges } from '@/lib/billing/lateCharges'
import { billingTerms, type BillingPanelItem } from '@/types/billing.types'
import { formatCurrency, formatPercent } from '@/types/financialEntry.types'
import { useUpdateBilling } from '../hooks/usePaymentChargeMutations'
import { parsePercentInput, percentToInput } from '../utils/percentInput'

type TermKey = 'lateFeePercent' | 'monthlyInterestPercent' | 'pixDiscountPercent'

const FIELDS: { key: TermKey; label: string; hint: string; max: number }[] = [
  { key: 'lateFeePercent', label: 'Multa (%)', hint: 'uma vez, depois do vencimento', max: 100 },
  { key: 'monthlyInterestPercent', label: 'Juros (% ao mês)', hint: 'por dia de atraso', max: 100 },
  { key: 'pixDiscountPercent', label: 'Desconto no Pix (%)', hint: 'até o vencimento', max: 99.99 },
]

/**
 * Multa, juros e desconto no Pix de uma cobrança (fase 3 de
 * docs/cobrancas.md, migration 97). Nascem do contrato; aqui dá para trocar.
 * Valem no próximo clique em "Pagar" do cliente.
 */
export function BillingTerms({
  item,
  canUpdate,
}: {
  item: BillingPanelItem
  canUpdate: boolean
}) {
  const terms = billingTerms(item.billing)
  const today = item.amountToday
  const [editing, setEditing] = useState(false)

  const summary = [
    terms.lateFeePercent ? `multa de ${formatPercent(terms.lateFeePercent)}` : null,
    terms.monthlyInterestPercent
      ? `juros de ${formatPercent(terms.monthlyInterestPercent)} ao mês`
      : null,
    terms.pixDiscountPercent
      ? `${formatPercent(terms.pixDiscountPercent)} de desconto no Pix até o vencimento`
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Percent className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Multa, juros e desconto
        </p>
        {canUpdate && !editing && (
          <Button type="button" variant="ghost" size="xs" onClick={() => setEditing(true)}>
            Alterar
          </Button>
        )}
      </div>

      {editing ? (
        <TermsForm item={item} onDone={() => setEditing(false)} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {summary.length > 0
              ? `${summary.join('; ')}.`.replace(/^./, (first) => first.toUpperCase())
              : 'Sem multa, juros nem desconto: o valor não muda com o atraso.'}
          </p>
          {today.lateFeeCents + today.interestCents > 0 && (
            <p className="text-xs">
              Hoje:{' '}
              <strong className="tabular-nums">{formatCurrency(today.totalCents / 100)}</strong>{' '}
              ({formatCurrency(today.principalCents / 100)}
              {today.lateFeeCents > 0 && ` + multa ${formatCurrency(today.lateFeeCents / 100)}`}
              {today.interestCents > 0 &&
                ` + juros de ${today.daysLate} ${today.daysLate === 1 ? 'dia' : 'dias'} ` +
                  formatCurrency(today.interestCents / 100)}
              ). Pagos, a multa e os juros entram como Encargos.
            </p>
          )}
          {today.pixDiscount && (
            <p className="text-xs">
              Hoje no Pix:{' '}
              <strong className="tabular-nums">
                {formatCurrency(today.pixDiscount.cents / 100)}
              </strong>
              .
            </p>
          )}
          {terms.pixDiscountPercent !== null && !today.pixDiscount && (
            <p className="text-xs text-muted-foreground">{discountOffReason(today)}</p>
          )}
          {!hasLateCharges(terms) && today.daysLate > 0 && (
            <p className="text-xs text-muted-foreground">
              Vencida, sem multa nem juros: o cliente paga o valor original.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Por que o desconto configurado não vale hoje. */
function discountOffReason(today: BillingPanelItem['amountToday']): string {
  if (today.graceUntil === null) return 'O desconto precisa de vencimento: sem data, não vale.'
  if (today.daysLate > 0) return 'Venceu: o desconto no Pix não vale mais.'
  return (
    'O desconto não vai no link: falta a API Key da InfinitePay (INFINITEPAY_API_KEY), ' +
    'que libera as opções do link.'
  )
}

function TermsForm({ item, onDone }: { item: BillingPanelItem; onDone: () => void }) {
  const update = useUpdateBilling()
  const current = billingTerms(item.billing)
  const [values, setValues] = useState<Record<TermKey, string>>({
    lateFeePercent: percentToInput(current.lateFeePercent),
    monthlyInterestPercent: percentToInput(current.monthlyInterestPercent),
    pixDiscountPercent: percentToInput(current.pixDiscountPercent),
  })

  const parsed = Object.fromEntries(
    FIELDS.map((field) => [field.key, parsePercentInput(values[field.key], field.max)]),
  ) as Record<TermKey, number | null | 'invalid'>
  const invalid = FIELDS.find((field) => parsed[field.key] === 'invalid')

  function save() {
    if (invalid) return
    update.mutate(
      {
        entryId: item.entry.id,
        changes: {
          terms: {
            lateFeePercent: parsed.lateFeePercent as number | null,
            monthlyInterestPercent: parsed.monthlyInterestPercent as number | null,
            pixDiscountPercent: parsed.pixDiscountPercent as number | null,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('Multa, juros e desconto salvos.')
          onDone()
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`billing-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            <Input
              id={`billing-${field.key}`}
              inputMode="decimal"
              placeholder="sem"
              value={values[field.key]}
              aria-invalid={parsed[field.key] === 'invalid'}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {invalid.label}: um número de 0 a {formatPercent(invalid.max)}, com até duas casas.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Valem a partir do próximo clique do cliente em &ldquo;Pagar&rdquo;. O sistema aplica o que
        for informado, sem conferir limite legal.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!!invalid || update.isPending} onClick={save}>
          {update.isPending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={update.isPending}
          onClick={onDone}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
