'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { useLegalProcesses } from '@/features/processos/hooks/useLegalProcesses'
import { useProfiles } from '@/hooks/useProfiles'
import { cn } from '@/lib/utils'
import { contractSchema, type ContractInput } from '@/schemas/contract.schema'
import {
  CONTRACT_KIND_HINTS,
  CONTRACT_KIND_LABELS,
  CONTRACT_KINDS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
} from '@/types/contract.types'
import { todayISO } from '@/types/financialEntry.types'
import { getDisplayName } from '@/utils/profile'
import { fromSelectValue, NONE_VALUE, toSelectValue } from '@/utils/select'
import type { PendingContractFile } from '../hooks/useContractMutations'
import { ContractFilesPicker } from './ContractFilesPicker'

/** Campo numérico opcional: vazio vira null, e a vírgula decimal do pt-BR
 * vira ponto. `NaN` sobra para o zod recusar com mensagem. */
function toOptionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'number') return value
  return Number(String(value).trim().replace(',', '.'))
}

/** Os status que existem depois da assinatura — quem registra um contrato já
 * assinado informa quando foi. */
const SIGNED_STATUSES = new Set(['vigente', 'encerrado', 'rescindido'])

interface ContractFormProps {
  defaultValues?: Partial<ContractInput>
  /** `files`: escolhidos no formulário, para subir depois de salvar. Vazio
   * quando `withFiles` não está ligado. */
  onSubmit: (data: ContractInput, files: PendingContractFile[]) => void
  isLoading?: boolean
  /** Só na criação. Ao editar, o status muda pelos botões do detalhe, que
   * guardam o histórico com intenção (e, na fase 4, oferecem o Financeiro). */
  withStatus?: boolean
  /** Só na criação. Ao editar, os arquivos se enviam pela seção do detalhe. */
  withFiles?: boolean
  submitLabel: string
}

export function ContractForm({
  defaultValues,
  onSubmit,
  isLoading,
  withStatus,
  withFiles,
  submitLabel,
}: ContractFormProps) {
  const { data: profiles = [] } = useProfiles()
  const { data: processos = [] } = useLegalProcesses()
  const [files, setFiles] = useState<PendingContractFile[]>([])
  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ContractInput>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      kind: 'honorarios',
      title: '',
      status: 'rascunho',
      client_id: '',
      legal_process_id: '',
      responsible_id: '',
      total_amount: null,
      installments: null,
      first_due_date: '',
      success_fee_percent: null,
      start_date: '',
      end_date: '',
      notice_days: 30,
      auto_renew: false,
      adjustment_index: '',
      signed_at: '',
      notes: '',
      ...defaultValues,
    },
  })

  const kind = watch('kind')
  const status = watch('status')
  // Ao editar, o status vem do contrato: a data da assinatura continua
  // corrigível mesmo sem o seletor de status.
  const showSignedAt = SIGNED_STATUSES.has(status)
  const activeProfiles = profiles.filter((profile) => profile.is_active)

  // O cliente segue o processo sempre que o processo tiver um — mesma regra do
  // formulário de lançamento, para os dois campos não divergirem.
  const linkedProcessoId = watch('legal_process_id')
  const clientLockedByProcesso =
    !!linkedProcessoId &&
    !!processos.find((p) => p.id === linkedProcessoId)?.crm_item?.client_id

  // min-w-0: o DialogContent é um grid, e um nome longo de cliente ou processo
  // alargaria a coluna (ver FinancialEntryForm).
  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(data, withFiles ? files : []))}
      className="min-w-0 space-y-5"
    >
      <div className="space-y-2">
        <Label>Tipo *</Label>
        <Controller
          name="kind"
          control={control}
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-3">
              {CONTRACT_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => field.onChange(option)}
                  aria-pressed={field.value === option}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-all',
                    field.value === option
                      ? 'border-primary bg-primary/8 text-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}
                >
                  <span className="block text-sm font-medium">{CONTRACT_KIND_LABELS[option]}</span>
                  <span className="block text-[11px] opacity-75">
                    {CONTRACT_KIND_HINTS[option]}
                  </span>
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contract-title">Nome *</Label>
        <Input
          id="contract-title"
          {...register('title')}
          placeholder={
            kind === 'honorarios'
              ? 'Ex: Honorários — Maria Silva'
              : kind === 'cliente_terceiros'
                ? 'Ex: Locação — Rua das Flores, 120'
                : 'Ex: Aluguel da sala'
          }
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {(withStatus || showSignedAt) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {withStatus && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      // Quem registra um contrato já assinado costuma fazê-lo
                      // no dia; a data fica editável ao lado.
                      if (SIGNED_STATUSES.has(value) && !getValues('signed_at')) {
                        setValue('signed_at', todayISO())
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_STATUSES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {CONTRACT_STATUS_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
          {showSignedAt && (
            <div className="space-y-2">
              <Label htmlFor="contract-signed-at">Assinado em</Label>
              <Input id="contract-signed-at" type="date" {...register('signed_at')} />
            </div>
          )}
        </div>
      )}

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vínculos
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label>Cliente{kind === 'honorarios' ? ' *' : ''}</Label>
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
            {errors.client_id ? (
              <p className="text-xs text-destructive">{errors.client_id.message}</p>
            ) : (
              clientLockedByProcesso && (
                <p className="text-[11px] text-muted-foreground">Definido pelo processo vinculado.</p>
              )
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Processo</Label>
            <Controller
              name="legal_process_id"
              control={control}
              render={({ field }) => (
                <ProcessoCombobox
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id ?? '')
                    // O processo carrega o cliente: sem isso os dois campos
                    // poderiam discordar em silêncio.
                    const clientId = processos.find((p) => p.id === id)?.crm_item?.client_id
                    if (clientId) setValue('client_id', clientId)
                  }}
                />
              )}
            />
            {errors.legal_process_id && (
              <p className="text-xs text-destructive">{errors.legal_process_id.message}</p>
            )}
          </div>
        </div>
        <div className="space-y-2 sm:max-w-[calc(50%-0.375rem)]">
          <Label>Responsável</Label>
          <Controller
            name="responsible_id"
            control={control}
            render={({ field }) => (
              <Select
                value={toSelectValue(field.value || null)}
                onValueChange={(value) => field.onChange(fromSelectValue(value) ?? '')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Ninguém</SelectItem>
                  {activeProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {getDisplayName(profile.full_name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-[11px] text-muted-foreground">
            Quem acompanha o contrato e vai receber o aviso de vencimento.
          </p>
        </div>
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Valores
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Valor total</Label>
            <Controller
              name="total_amount"
              control={control}
              render={({ field }) => (
                <CurrencyInput
                  value={field.value ?? undefined}
                  onChange={(value) => field.onChange(value ?? null)}
                />
              )}
            />
            {errors.total_amount && (
              <p className="text-xs text-destructive">{errors.total_amount.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="contract-installments">Parcelas</Label>
              <Input
                id="contract-installments"
                inputMode="numeric"
                placeholder="1"
                {...register('installments', { setValueAs: toOptionalNumber })}
              />
              {errors.installments && (
                <p className="text-xs text-destructive">{errors.installments.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-first-due">1º vencimento</Label>
              <Input id="contract-first-due" type="date" {...register('first_due_date')} />
            </div>
          </div>
        </div>
        {kind === 'honorarios' && (
          <div className="space-y-2 sm:max-w-[calc(50%-0.375rem)]">
            <Label htmlFor="contract-success-fee">Êxito (%)</Label>
            <Input
              id="contract-success-fee"
              inputMode="decimal"
              placeholder="Ex: 20"
              {...register('success_fee_percent', { setValueAs: toOptionalNumber })}
            />
            {errors.success_fee_percent && (
              <p className="text-xs text-destructive">{errors.success_fee_percent.message}</p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vigência
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="contract-start">Início</Label>
            <Input id="contract-start" type="date" {...register('start_date')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract-end">Fim</Label>
            <Input id="contract-end" type="date" {...register('end_date')} />
            {errors.end_date && (
              <p className="text-xs text-destructive">{errors.end_date.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract-notice">Avisar (dias antes)</Label>
            <Input
              id="contract-notice"
              inputMode="numeric"
              {...register('notice_days', { setValueAs: toOptionalNumber })}
            />
            {errors.notice_days && (
              <p className="text-xs text-destructive">{errors.notice_days.message}</p>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contract-adjustment">Índice de reajuste</Label>
            <Input
              id="contract-adjustment"
              placeholder="Ex: IPCA, IGP-M"
              {...register('adjustment_index')}
            />
          </div>
          <Controller
            name="auto_renew"
            control={control}
            render={({ field }) => (
              <div className="flex items-start gap-2.5 self-end rounded-lg border px-3 py-2.5">
                <Checkbox
                  id="contract-auto-renew"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="contract-auto-renew" className="text-sm font-normal">
                  Renova automaticamente
                </Label>
              </div>
            )}
          />
        </div>
      </section>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="contract-notes">Observações</Label>
        <Textarea id="contract-notes" rows={3} {...register('notes')} />
      </div>

      {withFiles && (
        <div className="border-t pt-4">
          <ContractFilesPicker
            value={files}
            onChange={setFiles}
            defaultRole={SIGNED_STATUSES.has(status) ? 'assinado' : 'minuta'}
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
