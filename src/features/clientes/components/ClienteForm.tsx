'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import {
  createIndividualClientSchema,
  createCompanyClientSchema,
  type CreateClientInput,
  type CreateIndividualClientInput,
  type CreateCompanyClientInput,
} from '@/schemas/cliente.schema'

interface ClienteFormProps {
  onSubmit: (data: CreateClientInput) => void
  isLoading?: boolean
}

export function ClienteForm({ onSubmit, isLoading }: ClienteFormProps) {
  const [type, setType] = useState<'individual' | 'company'>('individual')

  const pfForm = useForm({
    resolver: zodResolver(createIndividualClientSchema),
    defaultValues: { type: 'individual' as const },
  })

  const pjForm = useForm({
    resolver: zodResolver(createCompanyClientSchema),
    defaultValues: { type: 'company' as const },
  })

  function handlePFSubmit(data: CreateIndividualClientInput) {
    onSubmit(data)
  }

  function handlePJSubmit(data: CreateCompanyClientInput) {
    onSubmit(data)
  }

  return (
    <Tabs value={type} onValueChange={(v) => setType(v as 'individual' | 'company')}>
      <TabsList className="w-full mb-4">
        <TabsTrigger value="individual" className="flex-1">Pessoa Física</TabsTrigger>
        <TabsTrigger value="company" className="flex-1">Pessoa Jurídica</TabsTrigger>
      </TabsList>

      <TabsContent value="individual">
        <form onSubmit={pfForm.handleSubmit(handlePFSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input {...pfForm.register('name')} placeholder="Nome completo" />
              {pfForm.formState.errors.name && (
                <p className="text-xs text-destructive">{pfForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input {...pfForm.register('cpf')} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input {...pfForm.register('phone')} placeholder="(11) 98765-4321" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>E-mail</Label>
              <Input {...pfForm.register('email')} type="email" placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input {...pfForm.register('address_city')} placeholder="São Paulo" />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input {...pfForm.register('address_state')} placeholder="SP" maxLength={2} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...pfForm.register('notes')} rows={3} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar Cliente
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="company">
        <form onSubmit={pjForm.handleSubmit(handlePJSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Razão Social *</Label>
              <Input {...pjForm.register('company_name')} placeholder="Empresa XPTO Ltda" />
              {pjForm.formState.errors.company_name && (
                <p className="text-xs text-destructive">{pjForm.formState.errors.company_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Nome Fantasia</Label>
              <Input {...pjForm.register('trade_name')} placeholder="XPTO" />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input {...pjForm.register('cnpj')} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input {...pjForm.register('contact_person')} placeholder="Nome do responsável" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input {...pjForm.register('phone')} placeholder="(11) 3000-0000" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>E-mail</Label>
              <Input {...pjForm.register('email')} type="email" placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input {...pjForm.register('address_city')} placeholder="São Paulo" />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input {...pjForm.register('address_state')} placeholder="SP" maxLength={2} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea {...pjForm.register('notes')} rows={3} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar Cliente
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  )
}
