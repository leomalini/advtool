'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

interface FinancialEntryFormProps {
  defaultValues?: Partial<FinancialEntryInput>
  /** `attachments`: documentos escolhidos no formulário, para subir depois de
   * salvar. Vazio quando `withAttachments` não está ligado. */
  onSubmit: (data: FinancialEntryInput, attachments: PendingAttachments) => void
  isLoading?: boolean
  /** Aberto de dentro de um caso/processo/cliente: o vínculo já está decidido,
   * então a seção de vínculos não é oferecida. */
  hideLinks?: boolean
  /** Só na criação. Ao editar, o lançamento já existe e a seção Documentos do
   * detalhe envia direto. */
  withAttachments?: boolean
}

export function FinancialEntryForm({
  defaultValues,
  onSubmit,
  isLoading,
  hideLinks,
  withAttachments,
}: FinancialEntryFormProps) {
  const { data: processos = [] } = useLegalProcesses()
  const [attachments, setAttachments] = useState<PendingAttachments>({
    files: [],
    category: 'comprovante',
  })
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
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
  const isConditional = settlementKind === 'conditional'
  const isReceita = type === 'receita'

  // O cliente segue o processo sempre que o processo tiver um — mesma regra do
  // EventForm, para os dois campos não divergirem.
  const linkedProcessoId = watch('legal_process_id')
  const clientLockedByProcesso =
    !!linkedProcessoId &&
    !!processos.find((p) => p.id === linkedProcessoId)?.crm_item?.client_id

  // min-w-0: o DialogContent é um grid, e item de grid não encolhe abaixo do
  // próprio conteúdo. Um cliente ou processo de nome longo (com `truncate`,
  // sem quebra de linha) alargava a coluna até o nome inteiro e estourava o
  // modal. Com ele, o formulário fica na largura do modal e o nome trunca.
  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(data, attachments))}
      className="space-y-4 min-w-0"
    >
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
                  onClick={() => field.onChange(t)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-all',
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
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <CurrencyInput
                value={typeof field.value === 'number' ? field.value : undefined}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
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
              <Select value={field.value} onValueChange={field.onChange}>
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
        Salvar Lançamento
      </Button>
    </form>
  )
}
