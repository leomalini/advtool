'use client'

import { Controller, useForm } from 'react-hook-form'
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
import { contractPartySchema, type ContractPartyInput } from '@/schemas/contract.schema'
import {
  MARITAL_STATUS_LABELS,
  SEX_LABELS,
  type ClientSex,
  type MaritalStatus,
} from '@/types/cliente.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { formatCEP, maskDocument } from '@/utils/format'
import { fromSelectValue, NONE_VALUE, toSelectValue } from '@/utils/select'
import { PartyRolePicker } from './PartyRolePicker'

const SEXES = Object.keys(SEX_LABELS) as ClientSex[]
const MARITAL_STATUSES = Object.keys(MARITAL_STATUS_LABELS) as MaritalStatus[]

const EMPTY_ADDRESS = {
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zip: '',
}

interface PartyFormProps {
  defaultValues?: Partial<ContractPartyInput>
  templateRoles: readonly TemplatePartyRole[]
  onSubmit: (data: ContractPartyInput) => void
  isLoading?: boolean
  submitLabel: string
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

/** Os dados de uma parte, como a qualificação os usa. */
export function PartyForm({
  defaultValues,
  templateRoles,
  onSubmit,
  isLoading,
  submitLabel,
}: PartyFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ContractPartyInput>({
    resolver: zodResolver(contractPartySchema),
    defaultValues: {
      role_key: '',
      role_label: '',
      person_type: 'individual',
      name: '',
      document: '',
      rg: '',
      rg_issuer: '',
      sex: null,
      birth_date: '',
      nationality: '',
      marital_status: null,
      profession: '',
      email: '',
      phone: '',
      representative: '',
      ...defaultValues,
      address: { ...EMPTY_ADDRESS, ...defaultValues?.address },
    },
  })

  const personType = watch('person_type')
  const isCompany = personType === 'company'
  const roleKey = watch('role_key')
  const roleLabel = watch('role_label')

  return (
    <form
      onSubmit={(event) => {
        // Pode abrir de dentro de outro formulário na árvore do React — o
        // submit sintético subiria até ele (ver ClienteForm).
        event.stopPropagation()
        void handleSubmit(onSubmit)(event)
      }}
      className="min-w-0 space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="party-role">Papel *</Label>
          <PartyRolePicker
            id="party-role"
            value={roleKey ? { key: roleKey, label: roleLabel } : null}
            onChange={(role) => {
              setValue('role_key', role.key, { shouldValidate: !!errors.role_key })
              setValue('role_label', role.label, { shouldValidate: !!errors.role_label })
            }}
            templateRoles={templateRoles}
          />
          <FieldError message={errors.role_key?.message ?? errors.role_label?.message} />
        </div>
        <div className="space-y-1.5">
          <Label>Pessoa</Label>
          <Controller
            name="person_type"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2">
                {(['individual', 'company'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={field.value === type}
                    onClick={() => field.onChange(type)}
                    className={cn(
                      'h-9 rounded-lg border text-sm transition-colors',
                      field.value === type
                        ? 'border-primary bg-primary/8 font-medium'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    )}
                  >
                    {type === 'individual' ? 'Física' : 'Jurídica'}
                  </button>
                ))}
              </div>
            )}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="party-name">{isCompany ? 'Razão social *' : 'Nome completo *'}</Label>
          <Input id="party-name" {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="party-document">{isCompany ? 'CNPJ' : 'CPF'}</Label>
          <Input
            id="party-document"
            inputMode="numeric"
            {...register('document')}
            onChange={(event) => setValue('document', maskDocument(event.target.value))}
          />
          <FieldError message={errors.document?.message} />
        </div>
      </div>

      {isCompany ? (
        <div className="space-y-1.5">
          <Label htmlFor="party-representative">Representante</Label>
          <Input
            id="party-representative"
            placeholder="Quem assina pela empresa, com a qualificação se o modelo pedir"
            {...register('representative')}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="party-rg">RG</Label>
              <Input id="party-rg" {...register('rg')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party-rg-issuer">Órgão emissor</Label>
              <Input id="party-rg-issuer" placeholder="SSP/ES" {...register('rg_issuer')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party-birth">Nascimento</Label>
              <Input id="party-birth" type="date" {...register('birth_date')} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Controller
                name="sex"
                control={control}
                render={({ field }) => (
                  <Select
                    value={toSelectValue(field.value)}
                    onValueChange={(value) => field.onChange(fromSelectValue(value))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Não informado</SelectItem>
                      {SEXES.map((sex) => (
                        <SelectItem key={sex} value={sex}>
                          {SEX_LABELS[sex]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Para a concordância: portador/portadora, casado/casada.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Estado civil</Label>
              <Controller
                name="marital_status"
                control={control}
                render={({ field }) => (
                  <Select
                    value={toSelectValue(field.value)}
                    onValueChange={(value) => field.onChange(fromSelectValue(value))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Não informado</SelectItem>
                      {MARITAL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {MARITAL_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="party-nationality">Nacionalidade</Label>
              <Input id="party-nationality" placeholder="brasileira" {...register('nationality')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="party-profession">Profissão</Label>
              <Input id="party-profession" {...register('profession')} />
            </div>
          </div>
        </>
      )}

      <fieldset className="space-y-3 border-t pt-3">
        <legend className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Endereço
        </legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <div className="space-y-1.5">
            <Label htmlFor="party-street">Logradouro</Label>
            <Input id="party-street" {...register('address.street')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-number">Número</Label>
            <Input id="party-number" {...register('address.number')} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="party-complement">Complemento</Label>
            <Input id="party-complement" {...register('address.complement')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-neighborhood">Bairro</Label>
            <Input id="party-neighborhood" {...register('address.neighborhood')} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_80px_130px]">
          <div className="space-y-1.5">
            <Label htmlFor="party-city">Cidade</Label>
            <Input id="party-city" {...register('address.city')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-state">UF</Label>
            <Input id="party-state" maxLength={2} {...register('address.state')} />
            <FieldError message={errors.address?.state?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="party-zip">CEP</Label>
            <Input
              id="party-zip"
              inputMode="numeric"
              {...register('address.zip')}
              onChange={(event) => setValue('address.zip', formatCEP(event.target.value))}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="party-email">E-mail</Label>
          <Input id="party-email" type="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="party-phone">Telefone</Label>
          <Input id="party-phone" {...register('phone')} />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}
