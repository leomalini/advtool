'use client'

import { useState } from 'react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useForm, useFieldArray, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  createIndividualClientSchema,
  createCompanyClientSchema,
  LEGAL_AREAS,
  type CreateClientInput,
  type CreateIndividualClientInput,
  type CreateCompanyClientInput,
} from '@/schemas/cliente.schema'
import type { ClientWithRelations } from '@/types/cliente.types'
import { AREAS_JURIDICAS } from '@/data/mock'

const CONTACT_LABELS = {
  phone: ['Celular', 'WhatsApp', 'Trabalho', 'Residencial'],
  email: ['Pessoal', 'Trabalho', 'Jurídico'],
}

interface ClienteFormProps {
  onSubmit: (data: CreateClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
}

// ── Seção de contatos adicionais ─────────────────────────────

interface ContactFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: ReturnType<typeof useForm<any>>['register']
}

function ContactFields({ control, register }: ContactFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' })

  return (
    <div className="col-span-2 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Contatos adicionais
        </Label>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => append({ type: 'phone', value: '', label: 'Celular', is_primary: false })}
          >
            <Plus className="h-3 w-3" />
            Telefone
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => append({ type: 'email', value: '', label: 'Pessoal', is_primary: false })}
          >
            <Plus className="h-3 w-3" />
            E-mail
          </Button>
        </div>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">
          Nenhum contato adicional. Use os botões acima para adicionar.
        </p>
      )}

      {fields.map((field, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contactType = (field as any).type as 'phone' | 'email'
        return (
          <div key={field.id} className="flex gap-2 items-start">
            <div className="w-24 shrink-0">
              <select
                {...register(`contacts.${index}.label`)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                {CONTACT_LABELS[contactType].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <Input
              {...register(`contacts.${index}.value`)}
              placeholder={contactType === 'phone' ? '(11) 98765-4321' : 'email@exemplo.com'}
              className="h-8 text-sm flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

// ── Formulário PF ─────────────────────────────────────────────

function PFForm({
  onSubmit,
  isLoading,
  defaultValues,
}: {
  onSubmit: (data: CreateIndividualClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
}) {
  const [isFetchingCpf, setIsFetchingCpf] = useState(false)

  const form = useForm<CreateIndividualClientInput>({
    resolver: zodResolver(createIndividualClientSchema),
    defaultValues: {
      type: 'individual',
      name: defaultValues?.name ?? '',
      cpf: defaultValues?.cpf ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      legal_area: defaultValues?.legal_area ?? undefined,
      address_street: defaultValues?.address_street ?? '',
      address_number: defaultValues?.address_number ?? '',
      address_complement: defaultValues?.address_complement ?? '',
      address_neighborhood: defaultValues?.address_neighborhood ?? '',
      address_city: defaultValues?.address_city ?? '',
      address_state: defaultValues?.address_state ?? '',
      address_zip: defaultValues?.address_zip ?? '',
      notes: defaultValues?.notes ?? '',
      contacts: defaultValues?.contacts?.map((c) => ({
        type: c.type,
        value: c.value,
        label: c.label ?? '',
        is_primary: c.is_primary,
      })) ?? [],
    },
  })

  async function handleCepBlur(cep: string) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        form.setValue('address_street', data.logradouro ?? '')
        form.setValue('address_neighborhood', data.bairro ?? '')
        form.setValue('address_city', data.localidade ?? '')
        form.setValue('address_state', data.uf ?? '')
      }
    } catch {
      // silently ignore
    }
  }

  async function handleCpfSearch() {
    const cpf = form.getValues('cpf')?.replace(/\D/g, '') ?? ''
    if (cpf.length !== 11) {
      toast.error('Digite um CPF válido antes de buscar.')
      return
    }
    setIsFetchingCpf(true)
    try {
      // CPF lookup requires a paid API (Serpro/Netlex).
      // For now, only validates the format and informs the user.
      await new Promise((r) => setTimeout(r, 400))
      toast.info('Busca automática por CPF requer integração com Serpro ou Netlex (paga). CPF validado localmente.')
    } finally {
      setIsFetchingCpf(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Nome */}
        <div className="col-span-2 space-y-1.5">
          <Label>Nome completo *</Label>
          <Input {...form.register('name')} placeholder="Nome completo" />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        {/* CPF */}
        <div className="col-span-2 space-y-1.5">
          <Label>CPF</Label>
          <div className="flex gap-2">
            <Input
              {...form.register('cpf')}
              placeholder="000.000.000-00"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5 shrink-0"
              onClick={handleCpfSearch}
              disabled={isFetchingCpf}
            >
              {isFetchingCpf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Buscar
            </Button>
          </div>
          {form.formState.errors.cpf && (
            <p className="text-xs text-destructive">{form.formState.errors.cpf.message}</p>
          )}
        </div>

        {/* Área jurídica */}
        <div className="col-span-2 space-y-1.5">
          <Label>Área jurídica</Label>
          <Select
            value={form.watch('legal_area') ?? ''}
            onValueChange={(v) => form.setValue('legal_area', v as typeof LEGAL_AREAS[number])}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione a área..." />
            </SelectTrigger>
            <SelectContent>
              {LEGAL_AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {AREAS_JURIDICAS[area].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Telefone principal */}
        <div className="space-y-1.5">
          <Label>Telefone principal</Label>
          <Input {...form.register('phone')} placeholder="(11) 98765-4321" />
        </div>

        {/* E-mail principal */}
        <div className="space-y-1.5">
          <Label>E-mail principal</Label>
          <Input {...form.register('email')} type="email" placeholder="email@exemplo.com" />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        {/* Contatos adicionais */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ContactFields control={form.control as any} register={form.register as any} />

        {/* Endereço */}
        <div className="col-span-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Endereço
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input
                {...form.register('address_zip')}
                placeholder="00000-000"
                onBlur={(e) => handleCepBlur(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input {...form.register('address_state')} placeholder="SP" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Logradouro</Label>
              <Input {...form.register('address_street')} placeholder="Rua das Flores" />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input {...form.register('address_number')} placeholder="123" />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input {...form.register('address_complement')} placeholder="Apto 42" />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input {...form.register('address_neighborhood')} placeholder="Jardim Paulista" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Cidade</Label>
              <Input {...form.register('address_city')} placeholder="São Paulo" />
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="col-span-2 space-y-1.5">
          <Label>Observações</Label>
          <Textarea {...form.register('notes')} rows={3} placeholder="Informações relevantes sobre o cliente..." />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {defaultValues ? 'Salvar alterações' : 'Cadastrar cliente'}
      </Button>
    </form>
  )
}

// ── Formulário PJ ─────────────────────────────────────────────

function PJForm({
  onSubmit,
  isLoading,
  defaultValues,
}: {
  onSubmit: (data: CreateCompanyClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
}) {
  const [isFetchingCnpj, setIsFetchingCnpj] = useState(false)

  const form = useForm<CreateCompanyClientInput>({
    resolver: zodResolver(createCompanyClientSchema),
    defaultValues: {
      type: 'company',
      company_name: defaultValues?.company_name ?? '',
      trade_name: defaultValues?.trade_name ?? '',
      cnpj: defaultValues?.cnpj ?? '',
      contact_person: defaultValues?.contact_person ?? '',
      phone: defaultValues?.phone ?? '',
      email: defaultValues?.email ?? '',
      legal_area: defaultValues?.legal_area ?? undefined,
      address_street: defaultValues?.address_street ?? '',
      address_number: defaultValues?.address_number ?? '',
      address_complement: defaultValues?.address_complement ?? '',
      address_neighborhood: defaultValues?.address_neighborhood ?? '',
      address_city: defaultValues?.address_city ?? '',
      address_state: defaultValues?.address_state ?? '',
      address_zip: defaultValues?.address_zip ?? '',
      notes: defaultValues?.notes ?? '',
      contacts: defaultValues?.contacts?.map((c) => ({
        type: c.type,
        value: c.value,
        label: c.label ?? '',
        is_primary: c.is_primary,
      })) ?? [],
    },
  })

  async function handleCnpjSearch() {
    const cnpj = form.getValues('cnpj')?.replace(/\D/g, '') ?? ''
    if (cnpj.length !== 14) {
      toast.error('Digite um CNPJ válido (14 dígitos) antes de buscar.')
      return
    }
    setIsFetchingCnpj(true)
    try {
      const res = await fetch(`/api/cnpj?cnpj=${cnpj}`)
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'CNPJ não encontrado.')
        return
      }
      const data = await res.json()
      if (data.company_name) form.setValue('company_name', data.company_name)
      if (data.trade_name) form.setValue('trade_name', data.trade_name)
      if (data.phone) form.setValue('phone', data.phone)
      if (data.email) form.setValue('email', data.email)
      if (data.address_street) form.setValue('address_street', data.address_street)
      if (data.address_number) form.setValue('address_number', data.address_number)
      if (data.address_complement) form.setValue('address_complement', data.address_complement)
      if (data.address_neighborhood) form.setValue('address_neighborhood', data.address_neighborhood)
      if (data.address_city) form.setValue('address_city', data.address_city)
      if (data.address_state) form.setValue('address_state', data.address_state)
      if (data.address_zip) form.setValue('address_zip', data.address_zip)
      toast.success('Dados preenchidos automaticamente!')
    } catch {
      toast.error('Erro ao buscar CNPJ.')
    } finally {
      setIsFetchingCnpj(false)
    }
  }

  async function handleCepBlur(cep: string) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        form.setValue('address_street', data.logradouro ?? '')
        form.setValue('address_neighborhood', data.bairro ?? '')
        form.setValue('address_city', data.localidade ?? '')
        form.setValue('address_state', data.uf ?? '')
      }
    } catch {
      // silently ignore
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* CNPJ */}
        <div className="col-span-2 space-y-1.5">
          <Label>CNPJ</Label>
          <div className="flex gap-2">
            <Input
              {...form.register('cnpj')}
              placeholder="00.000.000/0001-00"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5 shrink-0"
              onClick={handleCnpjSearch}
              disabled={isFetchingCnpj}
            >
              {isFetchingCnpj ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Buscar CNPJ
            </Button>
          </div>
          {form.formState.errors.cnpj && (
            <p className="text-xs text-destructive">{form.formState.errors.cnpj.message}</p>
          )}
        </div>

        {/* Razão Social */}
        <div className="col-span-2 space-y-1.5">
          <Label>Razão Social *</Label>
          <Input {...form.register('company_name')} placeholder="Empresa XPTO Ltda" />
          {form.formState.errors.company_name && (
            <p className="text-xs text-destructive">{form.formState.errors.company_name.message}</p>
          )}
        </div>

        {/* Nome Fantasia */}
        <div className="col-span-2 space-y-1.5">
          <Label>Nome Fantasia</Label>
          <Input {...form.register('trade_name')} placeholder="XPTO" />
        </div>

        {/* Responsável */}
        <div className="space-y-1.5">
          <Label>Contato responsável</Label>
          <Input {...form.register('contact_person')} placeholder="Nome do responsável" />
        </div>

        {/* Área jurídica */}
        <div className="space-y-1.5">
          <Label>Área jurídica</Label>
          <Select
            value={form.watch('legal_area') ?? ''}
            onValueChange={(v) => form.setValue('legal_area', v as typeof LEGAL_AREAS[number])}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {LEGAL_AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {AREAS_JURIDICAS[area].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Telefone principal */}
        <div className="space-y-1.5">
          <Label>Telefone principal</Label>
          <Input {...form.register('phone')} placeholder="(11) 3000-0000" />
        </div>

        {/* E-mail principal */}
        <div className="space-y-1.5">
          <Label>E-mail principal</Label>
          <Input {...form.register('email')} type="email" placeholder="contato@empresa.com" />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        {/* Contatos adicionais */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ContactFields control={form.control as any} register={form.register as any} />

        {/* Endereço */}
        <div className="col-span-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Endereço
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input
                {...form.register('address_zip')}
                placeholder="00000-000"
                onBlur={(e) => handleCepBlur(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input {...form.register('address_state')} placeholder="SP" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Logradouro</Label>
              <Input {...form.register('address_street')} placeholder="Rua das Flores" />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input {...form.register('address_number')} placeholder="123" />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input {...form.register('address_complement')} placeholder="Sala 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input {...form.register('address_neighborhood')} placeholder="Itaim Bibi" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Cidade</Label>
              <Input {...form.register('address_city')} placeholder="São Paulo" />
            </div>
          </div>
        </div>

        {/* Observações */}
        <div className="col-span-2 space-y-1.5">
          <Label>Observações</Label>
          <Textarea
            {...form.register('notes')}
            rows={3}
            placeholder="Informações relevantes sobre a empresa..."
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {defaultValues ? 'Salvar alterações' : 'Cadastrar cliente'}
      </Button>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────

export function ClienteForm({ onSubmit, isLoading, defaultValues }: ClienteFormProps) {
  const initialType =
    defaultValues?.type === 'company' ? 'company' : 'individual'
  const [type, setType] = useState<'individual' | 'company'>(initialType)

  return (
    <Tabs value={type} onValueChange={(v) => setType(v as 'individual' | 'company')}>
      {!defaultValues && (
        <TabsList className="w-full mb-4">
          <TabsTrigger value="individual" className="flex-1">Pessoa Física</TabsTrigger>
          <TabsTrigger value="company" className="flex-1">Pessoa Jurídica</TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="individual">
        <PFForm
          onSubmit={(data) => onSubmit(data)}
          isLoading={isLoading}
          defaultValues={defaultValues}
        />
      </TabsContent>

      <TabsContent value="company">
        <PJForm
          onSubmit={(data) => onSubmit(data)}
          isLoading={isLoading}
          defaultValues={defaultValues}
        />
      </TabsContent>
    </Tabs>
  )
}
