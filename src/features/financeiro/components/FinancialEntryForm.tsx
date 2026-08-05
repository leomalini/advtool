'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  FINANCIAL_TYPE_LABELS,
  FINANCIAL_CATEGORY_LABELS,
  FINANCIAL_STATUS_LABELS,
  type FinancialEntryType,
  type FinancialEntryCategory,
  type FinancialEntryStatus,
} from '@/types/financialEntry.types'

const TYPES = Object.keys(FINANCIAL_TYPE_LABELS) as FinancialEntryType[]
const CATEGORIES = Object.keys(FINANCIAL_CATEGORY_LABELS) as FinancialEntryCategory[]
const STATUSES = Object.keys(FINANCIAL_STATUS_LABELS) as FinancialEntryStatus[]

interface FinancialEntryFormProps {
  defaultValues?: Partial<FinancialEntryInput>
  onSubmit: (data: FinancialEntryInput) => void
  isLoading?: boolean
  /** Aberto de dentro de um caso/processo/cliente: o vínculo já está decidido,
   * então a seção de vínculos não é oferecida. */
  hideLinks?: boolean
}

export function FinancialEntryForm({
  defaultValues,
  onSubmit,
  isLoading,
  hideLinks,
}: FinancialEntryFormProps) {
  const { data: processos = [] } = useLegalProcesses()
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinancialEntryInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(financialEntrySchema) as any,
    defaultValues: {
      type: 'receita',
      category: 'honorario',
      status: 'pendente',
      due_date: new Date().toISOString().slice(0, 10),
      ...defaultValues,
    },
  })

  const type = watch('type')
  const status = watch('status')

  // O cliente segue o processo sempre que o processo tiver um — mesma regra do
  // EventForm, para os dois campos não divergirem.
  const linkedProcessoId = watch('legal_process_id')
  const clientLockedByProcesso =
    !!linkedProcessoId &&
    !!processos.find((p) => p.id === linkedProcessoId)?.crm_item?.client_id

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Vencimento *</Label>
          <Input type="date" {...register('due_date')} />
          {errors.due_date && (
            <p className="text-xs text-destructive">{errors.due_date.message}</p>
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
