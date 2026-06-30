'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createLeadSchema, type CreateLeadInput } from '@/schemas/lead.schema'
import { LEAD_ORIGIN_LABELS } from '@/types/lead.types'
import { useLeadStages } from '../hooks/useLeads'
import { Loader2 } from 'lucide-react'

interface LeadFormProps {
  defaultStageId?: string
  defaultValues?: Partial<CreateLeadInput>
  onSubmit: (data: CreateLeadInput) => void
  isLoading?: boolean
}

export function LeadForm({ defaultStageId, defaultValues, onSubmit, isLoading }: LeadFormProps) {
  const { data: stages } = useLeadStages()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      stage_id: defaultStageId ?? stages?.[0]?.id ?? '',
      ...defaultValues,
    },
  })

  const selectedStageId = watch('stage_id')
  const selectedOrigin = watch('origin')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome *</Label>
        <Input id="name" {...register('name')} placeholder="Nome do lead" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" {...register('phone')} placeholder="(11) 98765-4321" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register('email')} placeholder="email@exemplo.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Etapa *</Label>
          <Select
            value={selectedStageId}
            onValueChange={(v) => setValue('stage_id', v ?? '')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.stage_id && (
            <p className="text-xs text-destructive">{errors.stage_id.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Origem</Label>
          <Select
            value={selectedOrigin ?? ''}
            onValueChange={(v) =>
              setValue('origin', v as CreateLeadInput['origin'])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar origem" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEAD_ORIGIN_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          {...register('notes')}
          placeholder="Informações relevantes sobre o lead..."
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar Lead
      </Button>
    </form>
  )
}
