'use client'

import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Download, FileText, Loader2, Save, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useOpenDocument } from '@/features/documentos/hooks/useDocumentMutations'
import { usePermissions } from '@/hooks/usePermissions'
import {
  officeSettingsSchema,
  type OfficeSettingsFormValues,
} from '@/schemas/officeSettings.schema'
import type { OfficeSettings, OfficeSettingsInput } from '@/types/officeSettings.types'
import { formatCEP, formatPhone, maskDocument } from '@/utils/format'
import {
  useOfficeSettings,
  useRemoveLetterhead,
  useSaveOfficeSettings,
  useUploadLetterhead,
} from '../hooks/useOfficeSettings'

const EMPTY_FORM: OfficeSettingsFormValues = {
  name: '',
  cnpj: '',
  oab_registration: '',
  zip: '',
  state: '',
  city: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  phone: '',
  email: '',
}

function toFormValues(settings: OfficeSettings | null): OfficeSettingsFormValues {
  if (!settings) return EMPTY_FORM
  const keys = Object.keys(EMPTY_FORM) as Array<keyof OfficeSettingsFormValues>
  const entries = keys.map((key) => [key, settings[key] ?? ''])
  return Object.fromEntries(entries) as OfficeSettingsFormValues
}

function toInput(values: OfficeSettingsFormValues): OfficeSettingsInput {
  const nullable = (value: string) => value.trim() || null
  return {
    name: nullable(values.name),
    cnpj: nullable(values.cnpj),
    oab_registration: nullable(values.oab_registration),
    zip: nullable(values.zip),
    state: nullable(values.state)?.toUpperCase() ?? null,
    city: nullable(values.city),
    street: nullable(values.street),
    number: nullable(values.number),
    complement: nullable(values.complement),
    neighborhood: nullable(values.neighborhood),
    phone: nullable(values.phone),
    email: nullable(values.email),
  }
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs text-muted-foreground">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Dados do escritório que entram nos documentos: `{escritorio_*}`,
 * `{local_e_data}` e o papel timbrado do Word livre do Assistente. Só quem
 * administra Configurações edita; os demais veem.
 */
export function OfficeSettingsCard() {
  const { data: settings = null, isLoading } = useOfficeSettings()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Informações do Escritório
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Usadas nos modelos de documento ({'{escritorio_nome}'}, {'{local_e_data}'}…) e no papel
          timbrado do Assistente.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          // Montado só depois de carregar: o formulário nasce com os valores
          // do banco, sem reset em efeito.
          <OfficeSettingsForm settings={settings} />
        )}
      </CardContent>
    </Card>
  )
}

function OfficeSettingsForm({ settings }: { settings: OfficeSettings | null }) {
  const { can } = usePermissions()
  const canEdit = can('configuracoes', 'manage')
  const save = useSaveOfficeSettings()
  const upload = useUploadLetterhead()
  const remove = useRemoveLetterhead()
  const openDocument = useOpenDocument()
  const fileInput = useRef<HTMLInputElement>(null)

  const form = useForm<OfficeSettingsFormValues>({
    resolver: zodResolver(officeSettingsSchema),
    defaultValues: toFormValues(settings),
  })
  const { register, setValue, handleSubmit, formState } = form
  const { errors } = formState

  async function handleCepBlur(cep: string) {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data: unknown = await response.json()
      if (typeof data !== 'object' || data === null || 'erro' in data) return
      const address = data as Record<string, string | undefined>
      setValue('street', address.logradouro ?? '')
      setValue('neighborhood', address.bairro ?? '')
      setValue('city', address.localidade ?? '')
      setValue('state', address.uf ?? '')
    } catch {
      // Sem internet ou CEP inexistente: o endereço é digitado à mão.
    }
  }

  function handleLetterhead(file: File | null) {
    if (!file) return
    upload.mutate({ file, current: settings })
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((values) => save.mutate(toInput(values)))}
    >
      <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Nome do escritório" error={errors.name?.message}>
            <Input
              {...register('name')}
              placeholder="Silva & Souza Advogados"
              className="h-9 text-sm"
            />
          </Field>
          <Field label="CNPJ" error={errors.cnpj?.message}>
            <Input
              {...register('cnpj')}
              onChange={(event) => setValue('cnpj', maskDocument(event.target.value))}
              placeholder="00.000.000/0000-00"
              className="h-9 font-mono text-sm"
            />
          </Field>
        </div>

        <Field
          label="Registro da sociedade na OAB (opcional)"
          error={errors.oab_registration?.message}
        >
          <Input
            {...register('oab_registration')}
            placeholder="OAB/ES 1.234"
            className="h-9 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[140px_80px_1fr]">
          <Field label="CEP" error={errors.zip?.message}>
            <Input
              {...register('zip')}
              onChange={(event) => setValue('zip', formatCEP(event.target.value))}
              onBlur={(event) => void handleCepBlur(event.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className="h-9 text-sm"
            />
          </Field>
          <Field label="UF" error={errors.state?.message}>
            <Input
              {...register('state')}
              placeholder="ES"
              maxLength={2}
              className="h-9 text-sm uppercase"
            />
          </Field>
          <Field label="Cidade" error={errors.city?.message}>
            <Input {...register('city')} placeholder="Vitória" className="h-9 text-sm" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
          <Field label="Logradouro" error={errors.street?.message}>
            <Input
              {...register('street')}
              placeholder="Av. Princesa Isabel"
              className="h-9 text-sm"
            />
          </Field>
          <Field label="Número" error={errors.number?.message}>
            <Input {...register('number')} className="h-9 text-sm" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Complemento" error={errors.complement?.message}>
            <Input {...register('complement')} placeholder="Sala 810" className="h-9 text-sm" />
          </Field>
          <Field label="Bairro" error={errors.neighborhood?.message}>
            <Input {...register('neighborhood')} className="h-9 text-sm" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail de contato" error={errors.email?.message}>
            <Input {...register('email')} type="email" className="h-9 text-sm" />
          </Field>
          <Field label="Telefone" error={errors.phone?.message}>
            <Input
              {...register('phone')}
              onChange={(event) => setValue('phone', formatPhone(event.target.value))}
              className="h-9 text-sm"
            />
          </Field>
        </div>
      </fieldset>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Papel timbrado</p>
        <p className="text-xs text-muted-foreground">
          Um .docx com o cabeçalho e o rodapé do escritório. O Assistente escreve os documentos
          livres (sem modelo) dentro dele.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {settings?.letterhead_path ? (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{settings.letterhead_file_name}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Baixar o papel timbrado"
                onClick={() => openDocument.mutate(settings.letterhead_path as string)}
              >
                <Download className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Nenhum enviado.</span>
          )}
          {canEdit && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(event) => handleLetterhead(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {settings?.letterhead_path ? 'Trocar' : 'Enviar .docx'}
              </Button>
              {settings?.letterhead_path && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(settings)}
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Salvar alterações
          </Button>
        </div>
      )}
    </form>
  )
}
