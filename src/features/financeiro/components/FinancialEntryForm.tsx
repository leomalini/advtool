'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { financialEntrySchema, type FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { useLegalProcesses } from '@/features/processos/hooks/useLegalProcesses'
import { Can } from '@/components/shared/Can'
import type { PendingAttachments } from '@/types/document.types'
import { FinancialEntryAttachmentsField } from './FinancialEntryAttachmentsField'
import {
  FINANCIAL_TYPE_LABELS,
  FINANCIAL_CATEGORY_LABELS,
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_SETTLEMENT_KIND_LABELS,
  feeFromBase,
  formatCurrency,
  formatPercent,
  todayISO,
  type FinancialEntryType,
  type FinancialEntryCategory,
  type FinancialEntryStatus,
  type FinancialSettlementKind,
} from '@/types/financialEntry.types'

const TYPES = Object.keys(FINANCIAL_TYPE_LABELS) as FinancialEntryType[]
const CATEGORIES = Object.keys(FINANCIAL_CATEGORY_LABELS) as FinancialEntryCategory[]
const STATUSES = Object.keys(FINANCIAL_STATUS_LABELS) as FinancialEntryStatus[]
const SETTLEMENT_KINDS = Object.keys(
  FINANCIAL_SETTLEMENT_KIND_LABELS
) as FinancialSettlementKind[]

const SETTLEMENT_KIND_HINTS: Record<FinancialSettlementKind, string> = {
  scheduled: 'Tem uma data para acontecer',
  conditional: 'Depende de um evento',
}

/** How the amount is defined (migration 89): typed, or a percentage of a base. */
export type FinancialValueMode = 'fixo' | 'percentual'

const VALUE_MODE_LABELS: Record<FinancialValueMode, string> = {
  fixo: 'Fixo',
  percentual: 'Percentual',
}

const VALUE_MODES = Object.keys(VALUE_MODE_LABELS) as FinancialValueMode[]

/** O que o formulário pede além dos campos do lançamento. */
export interface FinancialEntrySubmitOptions {
  /** Gerar o link da InfinitePay logo depois de criar — só receita pendente. */
  generatePaymentLink: boolean
}

/** Por que valor, tipo e situação estão travados (migration 67). */
export type FinancialEntryChargeLock = 'live' | 'paid' | null

const CHARGE_LOCK_HINTS: Record<Exclude<FinancialEntryChargeLock, null>, string> = {
  live:
    'Há um link de pagamento em aberto: valor, tipo e situação ficam travados. Para mudar, ' +
    'cancele o link no detalhe do lançamento.',
  paid: 'Pago pela InfinitePay: valor, tipo e situação ficam travados.',
}

interface FinancialEntryFormProps {
  defaultValues?: Partial<FinancialEntryInput>
  /** `attachments`: documentos escolhidos no formulário, para subir depois de
   * salvar. Vazio quando `withAttachments` não está ligado. */
  onSubmit: (
    data: FinancialEntryInput,
    attachments: PendingAttachments,
    options: FinancialEntrySubmitOptions,
  ) => void
  isLoading?: boolean
  /** Aberto de dentro de um caso/processo/cliente: o vínculo já está decidido,
   * então a seção de vínculos não é oferecida. */
  hideLinks?: boolean
  /** Só na criação. Ao editar, o lançamento já existe e a seção Documentos do
   * detalhe envia direto. */
  withAttachments?: boolean
  /** Só na criação, e só com a conta da InfinitePay configurada: oferece gerar
   * o link de pagamento junto. */
  offerPaymentLink?: boolean
  /** Ao editar um lançamento com link vivo ou pago: o banco recusaria mudar
   * valor, tipo e situação, então a tela nem oferece. */
  chargeLock?: FinancialEntryChargeLock
  /** How the amount starts. By default, percentual when the defaults carry a
   * percentage — "Registrar êxito" opens it on percentual with none yet. */
  initialValueMode?: FinancialValueMode
  /** The button's words ("Salvar Lançamento" by default). */
  submitLabel?: string
}

export function FinancialEntryForm({
  defaultValues,
  onSubmit,
  isLoading,
  hideLinks,
  withAttachments,
  offerPaymentLink,
  chargeLock = null,
  initialValueMode,
  submitLabel = 'Salvar Lançamento',
}: FinancialEntryFormProps) {
  const { data: processos = [] } = useLegalProcesses()
  const [attachments, setAttachments] = useState<PendingAttachments>({
    files: [],
    category: 'comprovante',
  })
  const [generatePaymentLink, setGeneratePaymentLink] = useState(false)
  const hadPercent = (defaultValues?.percent ?? null) !== null
  const [valueMode, setValueMode] = useState<FinancialValueMode>(
    initialValueMode ?? (hadPercent ? 'percentual' : 'fixo')
  )
  const locked = chargeLock !== null
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FinancialEntryInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(financialEntrySchema) as any,
    defaultValues: {
      type: 'receita',
      category: 'honorario',
      status: 'pendente',
      settlement_kind: 'scheduled',
      due_date: todayISO(),
      ...defaultValues,
    },
  })

  const type = watch('type')
  const status = watch('status')
  const settlementKind = watch('settlement_kind')
  const percent = watch('percent')
  const baseAmount = watch('base_amount')
  const isConditional = settlementKind === 'conditional'
  const isReceita = type === 'receita'
  const isPercentual = valueMode === 'percentual'
  // To assess (migration 89): a percentage with no base value — R$ 0,
  // pending, conditional until "Apurar".
  const toAssess = isPercentual && (baseAmount ?? null) === null

  // O cliente segue o processo sempre que o processo tiver um — mesma regra do
  // EventForm, para os dois campos não divergirem.
  const linkedProcessoId = watch('legal_process_id')
  const linkedProcesso = linkedProcessoId
    ? processos.find((p) => p.id === linkedProcessoId)
    : undefined
  const clientLockedByProcesso = !!linkedProcesso?.crm_item?.client_id
  // The case value as a starting estimate — often far from the real benefit,
  // so it is offered, never filled in.
  const caseValue = linkedProcesso?.case_value ?? null

  // Some quando deixa de ser receita pendente, e o envio confere de novo: o
  // marcado de uma receita não pode virar link de uma despesa trocada depois.
  const canOfferPaymentLink =
    !!offerPaymentLink && isReceita && status === 'pendente' && !toAssess

  /** Entering "a apurar" takes the fields it rules over: R$ 0, pending,
   * conditional. Called from the handlers that can get there. */
  function enterToAssess() {
    setValue('amount', 0)
    setValue('status', 'pendente')
    if (getValues('settlement_kind') !== 'conditional') {
      setValue('settlement_kind', 'conditional')
      // A previsão nasce vazia, como ao trocar a forma à mão.
      setValue('due_date', '')
    }
  }

  /** The fee follows the base and the percentage as they are typed; the
   * amount stays editable for a rounded or agreed value. */
  function applyFee(nextBase: number | null | undefined, nextPercent: number | null | undefined) {
    if (nextBase === null || nextBase === undefined) {
      enterToAssess()
      return
    }
    if (typeof nextPercent === 'number' && !Number.isNaN(nextPercent)) {
      setValue('amount', feeFromBase(nextBase, nextPercent))
    }
  }

  function chooseValueMode(mode: FinancialValueMode) {
    setValueMode(mode)
    if (mode === 'percentual') {
      if (!getValues('base_description')) setValue('base_description', 'o proveito econômico')
      applyFee(getValues('base_amount'), getValues('percent'))
    } else {
      // Zod reads every value in the form: a percentage typed before the switch
      // would keep the entry "to assess" behind the fixed amount.
      setValue('percent', null)
      setValue('base_amount', null)
      setValue('estimated_base_amount', null)
      clearErrors(['percent', 'base_description'])
    }
  }

  /** Fixed mode leaves the percentage out of the write — and clears it only
   * on an entry that had one, so a fixed entry never touches the columns. */
  function withValueMode(data: FinancialEntryInput): FinancialEntryInput {
    if (isPercentual) return data
    const fixed: FinancialEntryInput = { ...data }
    delete fixed.percent
    delete fixed.base_description
    delete fixed.base_amount
    delete fixed.estimated_base_amount
    return hadPercent
      ? {
          ...fixed,
          percent: null,
          base_description: null,
          base_amount: null,
          estimated_base_amount: null,
        }
      : fixed
  }

  const submitForm = handleSubmit((data) =>
    onSubmit(withValueMode(data), attachments, {
      generatePaymentLink:
        !!offerPaymentLink &&
        data.type === 'receita' &&
        data.status === 'pendente' &&
        !toAssess &&
        generatePaymentLink,
    })
  )

  /** Zod cannot tell an empty percentage from a fixed amount: this mode asks
   * for it here, or the error would be about an amount that is not on screen. */
  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    const typedPercent = getValues('percent')
    if (isPercentual && (typeof typedPercent !== 'number' || Number.isNaN(typedPercent))) {
      event.preventDefault()
      setError('percent', { message: 'Informe o percentual' })
      return
    }
    void submitForm(event)
  }

  // min-w-0: o DialogContent é um grid, e item de grid não encolhe abaixo do
  // próprio conteúdo. Um cliente ou processo de nome longo (com `truncate`,
  // sem quebra de linha) alargava a coluna até o nome inteiro e estourava o
  // modal. Com ele, o formulário fica na largura do modal e o nome trunca.
  return (
    <form onSubmit={handleFormSubmit} className="space-y-4 min-w-0">
      {chargeLock && (
        <p className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
          {CHARGE_LOCK_HINTS[chargeLock]}
        </p>
      )}

      {/* Tipo — receita/despesa muda o sinal do valor em toda a UI */}
      <div className="space-y-2">
        <Label>Tipo *</Label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={locked}
                  onClick={() => field.onChange(t)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    field.value === t
                      ? t === 'receita'
                        ? 'border-success bg-success/10 text-success'
                        : 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}
                >
                  {FINANCIAL_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label>Descrição *</Label>
        <Input {...register('description')} placeholder="Ex: Honorários — 1ª parcela" />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Valor *</Label>
          {/* Fixed, or a percentage of a base (migration 89). */}
          <div role="group" aria-label="Como o valor é definido" className="grid grid-cols-2 gap-1">
            {VALUE_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={locked}
                aria-pressed={valueMode === mode}
                onClick={() => chooseValueMode(mode)}
                className={cn(
                  'h-9 rounded-md border px-2 text-sm transition-all',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  valueMode === mode
                    ? 'border-foreground/40 bg-muted/50 font-medium'
                    : 'border-border text-muted-foreground hover:border-foreground/30'
                )}
              >
                {VALUE_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {FINANCIAL_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {isPercentual ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Percentual *</Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max="100"
                  disabled={locked}
                  {...register('percent', {
                    valueAsNumber: true,
                    onChange: (event) => {
                      clearErrors('percent')
                      applyFee(getValues('base_amount'), event.target.valueAsNumber)
                    },
                  })}
                  className="pr-7 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sobre *</Label>
              <Input
                {...register('base_description')}
                placeholder="o proveito econômico"
              />
            </div>
          </div>
          {(errors.percent || errors.base_description) && (
            <p className="text-xs text-destructive">
              {errors.percent?.message ?? errors.base_description?.message}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da base</Label>
              <Controller
                name="base_amount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={typeof field.value === 'number' ? field.value : undefined}
                    onChange={(value) => {
                      field.onChange(value ?? null)
                      applyFee(value ?? null, getValues('percent'))
                    }}
                    placeholder="a apurar"
                    disabled={locked}
                  />
                )}
              />
            </div>

            {toAssess ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Estimativa da base</Label>
                <Controller
                  name="estimated_base_amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      value={typeof field.value === 'number' ? field.value : undefined}
                      onChange={(value) => field.onChange(value ?? null)}
                      placeholder="opcional"
                    />
                  )}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Valor *</Label>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      value={typeof field.value === 'number' ? field.value : undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      disabled={locked}
                    />
                  )}
                />
              </div>
            )}
          </div>

          {toAssess ? (
            <div className="space-y-1">
              {caseValue !== null && (
                <button
                  type="button"
                  onClick={() => setValue('estimated_base_amount', caseValue)}
                  className="text-xs text-primary hover:underline"
                >
                  Estimar pelo valor da causa ({formatCurrency(caseValue)})
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                A apurar: fica em R$ 0, em condição especial, até você informar o valor da
                base. A estimativa só aparece na aba Êxitos — não entra no A receber.
              </p>
            </div>
          ) : (
            typeof baseAmount === 'number' &&
            typeof percent === 'number' &&
            !Number.isNaN(percent) && (
              <p className="text-[11px] text-muted-foreground">
                {formatPercent(percent)} de {formatCurrency(baseAmount)} ={' '}
                {formatCurrency(feeFromBase(baseAmount, percent))}
              </p>
            )
          )}
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                value={typeof field.value === 'number' ? field.value : undefined}
                onChange={(v) => field.onChange(v ?? '')}
                disabled={locked}
              />
            )}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
      )}

      {/* Forma de liquidação — o campo que separa "A vencer" de "Condição
          especial". É uma escolha explícita de propósito: deixar em branco a
          data NÃO classifica o lançamento (ver a migration 40). */}
      <div className="space-y-2">
        <Label>{isReceita ? 'Forma de recebimento' : 'Forma de pagamento'} *</Label>
        <Controller
          name="settlement_kind"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2">
              {SETTLEMENT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  // A apurar só existe em condição especial (migration 89).
                  disabled={toAssess && k === 'scheduled'}
                  onClick={() => {
                    field.onChange(k)
                    // A data muda de papel junto com o modo: vencimento é
                    // obrigatório, previsão nasce vazia para não inventar uma
                    // estimativa que ninguém escolheu.
                    // getValues, não watch: leitura pontual dentro do handler,
                    // sem criar assinatura de re-render.
                    if (k === 'conditional') setValue('due_date', '')
                    else if (!getValues('due_date')) setValue('due_date', todayISO())
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-all',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    field.value === k
                      ? k === 'conditional'
                        ? 'border-info bg-info/10 text-info'
                        : 'border-foreground/40 bg-muted/50'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}
                >
                  <span className="block text-sm font-medium">
                    {FINANCIAL_SETTLEMENT_KIND_LABELS[k]}
                  </span>
                  <span className="block text-[11px] opacity-70">
                    {SETTLEMENT_KIND_HINTS[k]}
                  </span>
                </button>
              ))}
            </div>
          )}
        />
        {errors.settlement_kind && (
          <p className="text-xs text-destructive">{errors.settlement_kind.message}</p>
        )}
      </div>

      {isConditional && (
        <div className="space-y-2">
          <Label>Condição *</Label>
          <Textarea
            {...register('condition_description')}
            rows={2}
            placeholder="Ex: após o trânsito em julgado / após a liberação do alvará"
          />
          {errors.condition_description && (
            <p className="text-xs text-destructive">{errors.condition_description.message}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{isConditional ? 'Previsão' : 'Vencimento *'}</Label>
          <Input type="date" {...register('due_date')} />
          {errors.due_date ? (
            <p className="text-xs text-destructive">{errors.due_date.message}</p>
          ) : (
            isConditional && (
              <p className="text-[11px] text-muted-foreground">
                Opcional. Previsão vencida não conta como atraso.
              </p>
            )
          )}
        </div>

        <div className="space-y-2">
          <Label>Situação</Label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                // A apurar não tem baixa: primeiro o valor da base.
                disabled={locked || toAssess}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {FINANCIAL_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.status && <p className="text-xs text-destructive">{errors.status.message}</p>}
        </div>
      </div>

      {/* Data de pagamento só faz sentido para o que já foi pago; se ficar
          vazia, o service preenche com hoje. */}
      {status === 'pago' && (
        <div className="space-y-2">
          <Label>Data do pagamento</Label>
          <Input type="date" {...register('paid_at')} />
          <p className="text-[11px] text-muted-foreground">
            Em branco, assume a data de hoje.
          </p>
        </div>
      )}

      {/* Vínculos — opcionais e buscáveis, mesmo padrão do EventForm */}
      {!hideLinks && (
        <div className="space-y-4 pt-1 border-t">
          <div className="space-y-2 pt-3">
            <Label>Processo</Label>
            <Controller
              name="legal_process_id"
              control={control}
              render={({ field }) => (
                <ProcessoCombobox
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id)
                    // O processo carrega o cliente: sem isso os dois campos
                    // poderiam discordar em silêncio.
                    const clientId = processos.find((p) => p.id === id)?.crm_item?.client_id
                    if (clientId) setValue('client_id', clientId)
                  }}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <ClienteCombobox
                  value={field.value}
                  disabled={clientLockedByProcesso}
                  onChange={(id) => {
                    field.onChange(id ?? '')
                    // Só alcançável quando o processo não tem cliente próprio.
                    if (linkedProcessoId) setValue('legal_process_id', '')
                  }}
                />
              )}
            />
            {clientLockedByProcesso && (
              <p className="text-[11px] text-muted-foreground">
                Definido pelo processo vinculado.
              </p>
            )}
          </div>
        </div>
      )}

      {canOfferPaymentLink && (
        <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
          <Checkbox
            id="generate-payment-link"
            checked={generatePaymentLink}
            onCheckedChange={(checked) => setGeneratePaymentLink(checked === true)}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="generate-payment-link" className="text-sm font-normal">
              Gerar link de pagamento ao salvar
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Link da InfinitePay (Pix ou cartão), pronto para copiar ou mandar pelo WhatsApp.
            </p>
          </div>
        </div>
      )}

      {/* Anexar é `financeiro:update`, não `documentos:create` — o arquivo é do
          lançamento (migration 63). */}
      {withAttachments && (
        <Can resource="financeiro" action="update">
          <div className="pt-3 border-t">
            <FinancialEntryAttachmentsField value={attachments} onChange={setAttachments} />
          </div>
        </Can>
      )}

      <Button
        type="submit"
        className={cn('w-full', type === 'despesa' && 'bg-destructive hover:bg-destructive/90')}
        disabled={isLoading}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
