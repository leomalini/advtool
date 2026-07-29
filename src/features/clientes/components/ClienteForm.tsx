'use client'

import { useState } from 'react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useForm, useFieldArray, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Loader2,
  Plus,
  Trash2,
  Search,
  FileText,
  Phone,
  MapPin,
  SlidersHorizontal,
  User,
  Building2,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  createIndividualClientSchema,
  createCompanyClientSchema,
  LEGAL_AREAS,
  type CreateClientInput,
  type CreateIndividualClientInput,
  type CreateCompanyClientInput,
} from '@/schemas/cliente.schema'
import type { ClientWithRelations } from '@/types/cliente.types'
import { getClientDisplayName } from '@/types/cliente.types'
import { AREAS_JURIDICAS } from '@/data/mock'
import { formatCPF, formatCNPJ, formatPhone, formatCEP } from '@/utils/format'

type ClientType = 'individual' | 'company'

const CONTACT_LABELS = {
  phone: ['Celular', 'WhatsApp', 'Trabalho', 'Residencial'],
  email: ['Pessoal', 'Trabalho', 'Jurídico'],
}

// ── Primitives — matches the visual language of CasoForm/ProcessoForm ───────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground bg-card',
        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors',
        'disabled:bg-muted/40 disabled:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground bg-card',
        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring resize-none transition-colors',
        className,
      )}
      {...props}
    />
  )
}

function SectionDivider({ icon: Icon, children }: { icon: React.ElementType; children: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{children}</span>
      <div className="flex-1 h-px bg-muted" />
    </div>
  )
}

// ── Tipo de Cliente — segmented toggle (same pattern as the Kanban/Tabela switcher) ──

function TypeToggle({ value, onChange }: { value: ClientType; onChange: (t: ClientType) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted border border-border rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onChange('individual')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
          value === 'individual'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <User className="w-3.5 h-3.5" />
        Pessoa Física
      </button>
      <button
        type="button"
        onClick={() => onChange('company')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
          value === 'company'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Building2 className="w-3.5 h-3.5" />
        Pessoa Jurídica
      </button>
    </div>
  )
}

// ── Área Jurídica select (shared between PF/PJ) ──────────────────────────────

function LegalAreaSelect({
  value,
  onChange,
}: {
  value: (typeof LEGAL_AREAS)[number] | null | undefined
  onChange: (v: (typeof LEGAL_AREAS)[number] | null) => void
}) {
  const label = value ? AREAS_JURIDICAS[value]?.label : undefined
  return (
    <Select value={value ?? ''} onValueChange={(v) => onChange((v || null) as (typeof LEGAL_AREAS)[number] | null)}>
      <SelectTrigger className="w-full text-sm bg-card">
        {label ? <span className="truncate text-sm">{label}</span> : <SelectValue placeholder="Selecionar área..." />}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">Não definida</SelectItem>
        {LEGAL_AREAS.map((area) => (
          <SelectItem key={area} value={area}>
            {AREAS_JURIDICAS[area].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Seção de contatos adicionais ─────────────────────────────

interface ContactFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: ReturnType<typeof useForm<any>>['register']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: ReturnType<typeof useForm<any>>['setValue']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: any
}

function ContactFields({ control, register, setValue, errors }: ContactFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts' })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>Contatos adicionais</FieldLabel>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => append({ type: 'phone', value: '', label: 'Celular', is_primary: false })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3" />
            Telefone
          </button>
          <button
            type="button"
            onClick={() => append({ type: 'email', value: '', label: 'Pessoal', is_primary: false })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="w-3 h-3" />
            E-mail
          </button>
        </div>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum contato adicional. Use os botões acima para adicionar.
        </p>
      )}

      {fields.map((field, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contactType = (field as any).type as 'phone' | 'email'
        const errorMessage = errors?.contacts?.[index]?.value?.message as string | undefined
        return (
          <div key={field.id} className="space-y-1">
            <div className="flex gap-2 items-start">
              <select
                {...register(`contacts.${index}.label`)}
                className="w-24 shrink-0 h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
              >
                {CONTACT_LABELS[contactType].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <Input
                {...register(`contacts.${index}.value`)}
                type={contactType === 'email' ? 'email' : 'text'}
                inputMode={contactType === 'phone' ? 'numeric' : undefined}
                maxLength={contactType === 'phone' ? 15 : 254}
                onChange={
                  contactType === 'phone'
                    ? (e) => setValue(`contacts.${index}.value`, formatPhone(e.target.value))
                    : undefined
                }
                placeholder={contactType === 'phone' ? '(11) 98765-4321' : 'email@exemplo.com'}
                className={cn('flex-1', errorMessage && 'border-destructive')}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Shell comum (header + sidebar + corpo) usado por PF e PJ ─────────────────

function FormShell({
  title,
  isEditing,
  isLoading,
  onClose,
  type,
  onTypeChange,
  legalArea,
  onLegalAreaChange,
  children,
}: {
  title: string
  isEditing: boolean
  isLoading: boolean
  onClose: () => void
  type: ClientType
  onTypeChange: (t: ClientType) => void
  legalArea: (typeof LEGAL_AREAS)[number] | null | undefined
  onLegalAreaChange: (v: (typeof LEGAL_AREAS)[number] | null) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full max-h-[90vh]">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-border flex-shrink-0 gap-0">
        <DialogTitle className="text-sm font-semibold text-foreground">{title}</DialogTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {isEditing ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </div>
      </DialogHeader>

      {/* ── Body: coluna única — o cadastro de cliente não tem campos de
          classificação (workflow/etapa) suficientes para justificar uma
          sidebar, então tudo flui numa única área rolável ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-8">
          <section>
            <SectionDivider icon={Tag}>Classificação</SectionDivider>
            <div className={cn('grid gap-4', isEditing ? 'grid-cols-1 max-w-xs' : 'grid-cols-2')}>
              {!isEditing && (
                <div>
                  <FieldLabel required>Tipo de Cliente</FieldLabel>
                  <TypeToggle value={type} onChange={onTypeChange} />
                </div>
              )}
              <div>
                <FieldLabel>Área Jurídica</FieldLabel>
                <LegalAreaSelect value={legalArea} onChange={onLegalAreaChange} />
              </div>
            </div>
          </section>

          {children}
        </div>
      </div>
    </div>
  )
}

// ── Formulário PF ─────────────────────────────────────────────

function PFForm({
  title,
  onClose,
  onSubmit,
  isLoading = false,
  defaultValues,
  type,
  onTypeChange,
  isEditing,
}: {
  title: string
  onClose: () => void
  onSubmit: (data: CreateIndividualClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
  type: ClientType
  onTypeChange: (t: ClientType) => void
  isEditing: boolean
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
    <form
      onSubmit={(e) => {
        // This form can be opened (via ClienteCombobox) from inside another
        // form's JSX tree — even though the dialog portals its DOM elsewhere,
        // React's synthetic submit event still bubbles through the component
        // tree, which would otherwise also submit the outer form.
        e.stopPropagation()
        void form.handleSubmit(onSubmit)(e)
      }}
      className="contents"
    >
      <FormShell
        title={title}
        isEditing={isEditing}
        isLoading={isLoading}
        onClose={onClose}
        type={type}
        onTypeChange={onTypeChange}
        legalArea={form.watch('legal_area')}
        onLegalAreaChange={(v) => form.setValue('legal_area', v ?? undefined, { shouldValidate: form.formState.isSubmitted })}
      >
        {/* ── Identificação ─────────────────────────────────────── */}
        <section>
          <SectionDivider icon={FileText}>Identificação</SectionDivider>
          <div className="space-y-4">
            <div>
              <FieldLabel required>Nome completo</FieldLabel>
              <Input {...form.register('name')} placeholder="Nome completo" />
              <FieldError message={form.formState.errors.name?.message} />
            </div>

            <div>
              <FieldLabel required>CPF</FieldLabel>
              <div className="flex gap-2">
                <Input
                  {...form.register('cpf')}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="flex-1"
                  onChange={(e) => form.setValue('cpf', formatCPF(e.target.value), { shouldValidate: form.formState.isSubmitted })}
                />
                <Button type="button" variant="outline" size="lg" onClick={handleCpfSearch} disabled={isFetchingCpf} className="gap-1.5 shrink-0">
                  {isFetchingCpf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Buscar
                </Button>
              </div>
              <FieldError message={form.formState.errors.cpf?.message} />
            </div>
          </div>
        </section>

        {/* ── Contato ───────────────────────────────────────────── */}
        <section>
          <SectionDivider icon={Phone}>Contato</SectionDivider>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Telefone principal</FieldLabel>
                <Input
                  {...form.register('phone')}
                  placeholder="(11) 98765-4321"
                  maxLength={15}
                  onChange={(e) => form.setValue('phone', formatPhone(e.target.value), { shouldValidate: form.formState.isSubmitted })}
                />
                <FieldError message={form.formState.errors.phone?.message} />
              </div>
              <div>
                <FieldLabel>E-mail principal</FieldLabel>
                <Input {...form.register('email')} type="email" placeholder="email@exemplo.com" />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
            </div>

            {/* eslint-disable @typescript-eslint/no-explicit-any */}
            <ContactFields
              control={form.control as any}
              register={form.register as any}
              setValue={form.setValue as any}
              errors={form.formState.errors}
            />
            {/* eslint-enable @typescript-eslint/no-explicit-any */}
          </div>
        </section>

        {/* ── Endereço ──────────────────────────────────────────── */}
        <section>
          <SectionDivider icon={MapPin}>Endereço</SectionDivider>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>CEP</FieldLabel>
              <Input
                {...form.register('address_zip')}
                placeholder="00000-000"
                maxLength={9}
                onChange={(e) => form.setValue('address_zip', formatCEP(e.target.value))}
                onBlur={(e) => handleCepBlur(e.target.value)}
              />
              <FieldError message={form.formState.errors.address_zip?.message} />
            </div>
            <div>
              <FieldLabel>UF</FieldLabel>
              <Input {...form.register('address_state')} placeholder="SP" maxLength={2} className="uppercase" />
              <FieldError message={form.formState.errors.address_state?.message} />
            </div>
            <div>
              <FieldLabel>Logradouro</FieldLabel>
              <Input {...form.register('address_street')} placeholder="Rua das Flores" />
            </div>
            <div>
              <FieldLabel>Número</FieldLabel>
              <Input {...form.register('address_number')} placeholder="123" />
            </div>
            <div>
              <FieldLabel>Complemento</FieldLabel>
              <Input {...form.register('address_complement')} placeholder="Apto 42" />
            </div>
            <div>
              <FieldLabel>Bairro</FieldLabel>
              <Input {...form.register('address_neighborhood')} placeholder="Jardim Paulista" />
            </div>
            <div className="col-span-2">
              <FieldLabel>Cidade</FieldLabel>
              <Input {...form.register('address_city')} placeholder="São Paulo" />
            </div>
          </div>
        </section>

        {/* ── Observações ───────────────────────────────────────── */}
        <section>
          <SectionDivider icon={SlidersHorizontal}>Observações</SectionDivider>
          <Textarea {...form.register('notes')} rows={5} placeholder="Informações relevantes sobre o cliente..." />
        </section>
      </FormShell>
    </form>
  )
}

// ── Formulário PJ ─────────────────────────────────────────────

function PJForm({
  title,
  onClose,
  onSubmit,
  isLoading = false,
  defaultValues,
  type,
  onTypeChange,
  isEditing,
}: {
  title: string
  onClose: () => void
  onSubmit: (data: CreateCompanyClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
  type: ClientType
  onTypeChange: (t: ClientType) => void
  isEditing: boolean
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
    <form
      onSubmit={(e) => {
        e.stopPropagation()
        void form.handleSubmit(onSubmit)(e)
      }}
      className="contents"
    >
      <FormShell
        title={title}
        isEditing={isEditing}
        isLoading={isLoading}
        onClose={onClose}
        type={type}
        onTypeChange={onTypeChange}
        legalArea={form.watch('legal_area')}
        onLegalAreaChange={(v) => form.setValue('legal_area', v ?? undefined, { shouldValidate: form.formState.isSubmitted })}
      >
        {/* ── Identificação ─────────────────────────────────────── */}
        <section>
          <SectionDivider icon={FileText}>Identificação</SectionDivider>
          <div className="space-y-4">
            <div>
              <FieldLabel required>CNPJ</FieldLabel>
              <div className="flex gap-2">
                <Input
                  {...form.register('cnpj')}
                  placeholder="00.000.000/0001-00"
                  maxLength={18}
                  className="flex-1"
                  onChange={(e) => form.setValue('cnpj', formatCNPJ(e.target.value), { shouldValidate: form.formState.isSubmitted })}
                />
                <Button type="button" variant="outline" size="lg" onClick={handleCnpjSearch} disabled={isFetchingCnpj} className="gap-1.5 shrink-0">
                  {isFetchingCnpj ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Buscar CNPJ
                </Button>
              </div>
              <FieldError message={form.formState.errors.cnpj?.message} />
            </div>

            <div>
              <FieldLabel required>Razão Social</FieldLabel>
              <Input {...form.register('company_name')} placeholder="Empresa XPTO Ltda" />
              <FieldError message={form.formState.errors.company_name?.message} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Nome Fantasia</FieldLabel>
                <Input {...form.register('trade_name')} placeholder="XPTO" />
              </div>
              <div>
                <FieldLabel>Contato responsável</FieldLabel>
                <Input {...form.register('contact_person')} placeholder="Nome do responsável" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Contato ───────────────────────────────────────────── */}
        <section>
          <SectionDivider icon={Phone}>Contato</SectionDivider>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Telefone principal</FieldLabel>
                <Input
                  {...form.register('phone')}
                  placeholder="(11) 3000-0000"
                  maxLength={15}
                  onChange={(e) => form.setValue('phone', formatPhone(e.target.value), { shouldValidate: form.formState.isSubmitted })}
                />
                <FieldError message={form.formState.errors.phone?.message} />
              </div>
              <div>
                <FieldLabel>E-mail principal</FieldLabel>
                <Input {...form.register('email')} type="email" placeholder="contato@empresa.com" />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
            </div>

            {/* eslint-disable @typescript-eslint/no-explicit-any */}
            <ContactFields
              control={form.control as any}
              register={form.register as any}
              setValue={form.setValue as any}
              errors={form.formState.errors}
            />
            {/* eslint-enable @typescript-eslint/no-explicit-any */}
          </div>
        </section>

        {/* ── Endereço ──────────────────────────────────────────── */}
        <section>
          <SectionDivider icon={MapPin}>Endereço</SectionDivider>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>CEP</FieldLabel>
              <Input
                {...form.register('address_zip')}
                placeholder="00000-000"
                maxLength={9}
                onChange={(e) => form.setValue('address_zip', formatCEP(e.target.value))}
                onBlur={(e) => handleCepBlur(e.target.value)}
              />
              <FieldError message={form.formState.errors.address_zip?.message} />
            </div>
            <div>
              <FieldLabel>UF</FieldLabel>
              <Input {...form.register('address_state')} placeholder="SP" maxLength={2} className="uppercase" />
              <FieldError message={form.formState.errors.address_state?.message} />
            </div>
            <div>
              <FieldLabel>Logradouro</FieldLabel>
              <Input {...form.register('address_street')} placeholder="Rua das Flores" />
            </div>
            <div>
              <FieldLabel>Número</FieldLabel>
              <Input {...form.register('address_number')} placeholder="123" />
            </div>
            <div>
              <FieldLabel>Complemento</FieldLabel>
              <Input {...form.register('address_complement')} placeholder="Sala 5" />
            </div>
            <div>
              <FieldLabel>Bairro</FieldLabel>
              <Input {...form.register('address_neighborhood')} placeholder="Itaim Bibi" />
            </div>
            <div className="col-span-2">
              <FieldLabel>Cidade</FieldLabel>
              <Input {...form.register('address_city')} placeholder="São Paulo" />
            </div>
          </div>
        </section>

        {/* ── Observações ───────────────────────────────────────── */}
        <section>
          <SectionDivider icon={SlidersHorizontal}>Observações</SectionDivider>
          <Textarea {...form.register('notes')} rows={5} placeholder="Informações relevantes sobre a empresa..." />
        </section>
      </FormShell>
    </form>
  )
}

// ── Componente principal ──────────────────────────────────────

interface ClienteFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations>
}

export function ClienteForm({ open, onClose, onSubmit, isLoading, defaultValues }: ClienteFormProps) {
  const initialType = defaultValues?.type === 'company' ? 'company' : 'individual'
  const [type, setType] = useState<ClientType>(initialType)
  // Only a real, persisted client has an id — the combobox's "create new" flow
  // also passes defaultValues (just to prefill the typed name), which must
  // NOT be treated as editing an existing client.
  const isEditing = !!defaultValues?.id
  const displayName = isEditing ? getClientDisplayName(defaultValues as ClientWithRelations) : ''
  const title = isEditing ? (displayName ? `Editar — ${displayName}` : 'Editar Cliente') : 'Novo Cliente'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0"
      >
        {type === 'individual' ? (
          <PFForm
            title={title}
            onClose={onClose}
            onSubmit={(data) => onSubmit(data)}
            isLoading={isLoading}
            defaultValues={defaultValues}
            type={type}
            onTypeChange={setType}
            isEditing={isEditing}
          />
        ) : (
          <PJForm
            title={title}
            onClose={onClose}
            onSubmit={(data) => onSubmit(data)}
            isLoading={isLoading}
            defaultValues={defaultValues}
            type={type}
            onTypeChange={setType}
            isEditing={isEditing}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
