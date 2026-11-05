'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { cn } from '@/lib/utils'
import {
  describePercentage,
  formatCurrency,
  formatPercent,
  todayISO,
  type FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import { useAssessSuccessFee } from '../hooks/useFinancialEntryMutations'
import {
  ASSESSMENT_MODE_LABELS,
  assessmentError,
  assessmentFee,
  buildAssessmentRows,
  type AssessmentMode,
  type AssessmentPlan,
  type AssessmentRow,
} from '../utils/successFees'

const MODES = Object.keys(ASSESSMENT_MODE_LABELS) as AssessmentMode[]

/** What the date field is, per mode. */
const DATE_LABELS: Record<AssessmentMode, string> = {
  recebido: 'Recebido em *',
  vencimento: 'Vencimento *',
  parcelado: '1º vencimento *',
  aguardando: 'Previsão',
}

function formatDay(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy')
}

interface AssessSuccessFeeDialogProps {
  /** A success fee to assess (`isToAssess`). */
  entry: FinancialEntryWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A base read elsewhere — the value a publication fixed. It only fills the
   * field: whoever assesses reads the text and confirms. */
  suggestion?: AssessmentSuggestion | null
}

export interface AssessmentSuggestion {
  amount: number
  /** Where it came from: "Condenação na publicação #115". */
  source: string
  /** Opens the text it came from. */
  href: string
}

/**
 * "Apurar" (docs/financeiro.md): the base is known, so the success fee gets
 * its amount — received, falling due, in installments, or still waiting on a
 * condition. "Foi só uma parte" writes the part as a new entry and keeps the
 * success fee open for the rest. Nothing is written before the click, and
 * everything is written together (`assess_success_fee`).
 */
export function AssessSuccessFeeDialog({
  entry,
  open,
  onOpenChange,
  suggestion = null,
}: AssessSuccessFeeDialogProps) {
  const assess = useAssessSuccessFee()

  return (
    <Dialog open={open} onOpenChange={(value) => !assess.isPending && onOpenChange(value)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        {/* Mounted on each opening: the plan starts from the entry as it is.
            The suggestion in the key: it can arrive after the dialog opens. */}
        {open && entry && (
          <AssessForm
            key={`${entry.id}:${suggestion?.amount ?? ''}`}
            entry={entry}
            suggestion={suggestion}
            isLoading={assess.isPending}
            onCancel={() => onOpenChange(false)}
            onConfirm={(rows, keepOpen) =>
              assess.mutate(
                { entryId: entry.id, rows, keepOpen },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AssessForm({
  entry,
  suggestion,
  isLoading,
  onCancel,
  onConfirm,
}: {
  entry: FinancialEntryWithRelations
  suggestion: AssessmentSuggestion | null
  isLoading: boolean
  onCancel: () => void
  onConfirm: (rows: AssessmentRow[], keepOpen: boolean) => void
}) {
  const [plan, setPlan] = useState<AssessmentPlan>(() => ({
    baseAmount: suggestion?.amount,
    feeOverride: undefined,
    mode: 'recebido',
    date: todayISO(),
    installments: 2,
    condition: entry.condition_description ?? '',
    partial: false,
    partDescription: `${entry.description} — parte`.slice(0, 300),
  }))

  function update(patch: Partial<AssessmentPlan>) {
    setPlan((current) => ({ ...current, ...patch }))
  }

  const computedFee = assessmentFee(entry, { ...plan, feeOverride: undefined })
  const fee = assessmentFee(entry, plan)
  const error = assessmentError(entry, plan)
  const rows = error ? [] : buildAssessmentRows(entry, plan)
  const estimate = entry.estimated_base_amount
  const percentLabel = entry.percent !== null ? formatPercent(entry.percent) : ''

  return (
    <>
      <DialogHeader>
        <DialogTitle>Apurar êxito</DialogTitle>
        <DialogDescription>
          {entry.description} · {describePercentage(entry)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {suggestion && (
          <p className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
            A base veio de: {suggestion.source}, lida pela IA.{' '}
            <Link href={suggestion.href} target="_blank" className="font-medium underline">
              Confira o texto
            </Link>{' '}
            antes de apurar.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Valor da base *</Label>
            <CurrencyInput
              value={plan.baseAmount}
              // A new base drops a fee typed by hand for the old one.
              onChange={(value) => update({ baseAmount: value, feeOverride: undefined })}
            />
            {estimate !== null && plan.baseAmount === undefined && (
              <button
                type="button"
                onClick={() => update({ baseAmount: estimate, feeOverride: undefined })}
                className="text-[11px] text-primary hover:underline"
              >
                Usar a estimativa ({formatCurrency(estimate)})
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Honorário</Label>
            {/* Without a base there is nothing to adjust yet. */}
            <CurrencyInput
              value={plan.baseAmount === undefined ? undefined : fee}
              onChange={(value) => update({ feeOverride: value })}
              disabled={plan.baseAmount === undefined}
            />
            {plan.feeOverride !== undefined && plan.feeOverride !== computedFee ? (
              <button
                type="button"
                onClick={() => update({ feeOverride: undefined })}
                className="text-[11px] text-primary hover:underline"
              >
                {`Voltar para ${percentLabel} da base (${formatCurrency(computedFee)})`}
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Ajuste se o acordo foi outro valor.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Como fica</Label>
          <div role="radiogroup" aria-label="Como fica" className="grid grid-cols-2 gap-2">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={plan.mode === mode}
                onClick={() =>
                  update({
                    mode,
                    // Still waiting: the forecast it already had stays.
                    date:
                      mode === 'recebido'
                        ? todayISO()
                        : mode === 'aguardando'
                          ? (entry.due_date ?? '')
                          : '',
                  })
                }
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-all',
                  plan.mode === mode
                    ? 'border-foreground/40 bg-muted/50 font-medium'
                    : 'border-border text-muted-foreground hover:border-foreground/30'
                )}
              >
                {ASSESSMENT_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{DATE_LABELS[plan.mode]}</Label>
            <Input
              type="date"
              value={plan.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </div>
          {plan.mode === 'parcelado' && (
            <div className="space-y-1.5">
              <Label>Parcelas *</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={120}
                value={plan.installments}
                onChange={(event) => update({ installments: Number(event.target.value) })}
              />
            </div>
          )}
        </div>

        {plan.mode === 'aguardando' && (
          <div className="space-y-1.5">
            <Label>O que ainda falta *</Label>
            <Input
              value={plan.condition}
              maxLength={300}
              onChange={(event) => update({ condition: event.target.value })}
              placeholder="Ex: expedição da RPV"
            />
          </div>
        )}

        <div className="space-y-2 rounded-lg border px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="assess-partial"
              checked={plan.partial}
              onCheckedChange={(checked) => update({ partial: checked === true })}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="assess-partial" className="text-sm font-normal">
                Foi só uma parte
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Esta parte vira um lançamento próprio, e o êxito continua a apurar para o
                restante — a RPV agora e o precatório depois, um acordo em etapas.
              </p>
            </div>
          </div>
          {plan.partial && (
            <Input
              aria-label="Nome desta parte"
              value={plan.partDescription}
              maxLength={300}
              onChange={(event) => update({ partDescription: event.target.value })}
            />
          )}
        </div>

        {/* What will be written, before the click. */}
        {rows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {plan.partial
                ? 'Lançamentos novos (o êxito segue a apurar)'
                : rows.length > 1
                  ? 'O êxito vira a 1ª parcela, e nascem as outras'
                  : 'O êxito fica assim'}
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {rows.map((row) => (
                <li key={row.description} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{row.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.status === 'pago'
                        ? `Recebido em ${formatDay(row.paid_at ?? row.due_date ?? todayISO())}`
                        : row.settlement_kind === 'conditional'
                          ? `${row.condition_description}${row.due_date ? ` · prev. ${formatDay(row.due_date)}` : ''}`
                          : `Vence ${row.due_date ? formatDay(row.due_date) : ''}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-success">
                    {formatCurrency(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && plan.baseAmount !== undefined && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button
          disabled={isLoading || error !== null}
          onClick={() => onConfirm(rows, plan.partial)}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {plan.partial ? 'Lançar a parte' : 'Apurar'}
        </Button>
      </DialogFooter>
    </>
  )
}
