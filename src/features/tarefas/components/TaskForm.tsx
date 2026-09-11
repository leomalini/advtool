'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { createTaskSchema, type CreateTaskInput } from '@/schemas/task.schema'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskStatus, type TaskPriority } from '@/types/task.types'
import { NONE_VALUE, toSelectValue, fromSelectValue } from '@/utils/select'
import { useProfiles } from '@/hooks/useProfiles'
import { getDisplayName } from '@/utils/profile'
import { RecurrenceFields } from '@/components/shared/RecurrenceFields'

interface TaskFormProps {
  defaultStatus?: TaskStatus
  defaultValues?: Partial<CreateTaskInput>
  onSubmit: (data: CreateTaskInput) => void
  isLoading?: boolean
}

export function TaskForm({ defaultStatus = 'todo', defaultValues, onSubmit, isLoading }: TaskFormProps) {
  const { data: profiles = [] } = useProfiles()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      status: defaultStatus,
      priority: 'medium',
      recurrence_type: '',
      recurrence_ends: 'until',
      ...defaultValues,
    },
  })

  const priority = watch('priority')
  const status = watch('status')
  const assignedTo = watch('assigned_to')
  const dueDate = watch('due_date')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Título *</Label>
        <Input {...register('title')} placeholder="Título da tarefa" />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea {...register('description')} rows={2} placeholder="Detalhes..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setValue('priority', v as TaskPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setValue('status', v as TaskStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Data Limite</Label>
          <Input type="date" {...register('due_date')} />
        </div>

        {/* Hora opcional: com ela a tarefa entra na grade de horas da Agenda;
            sem ela, fica na faixa "Dia todo". Sem data não há onde pô-la. */}
        <div className="space-y-1.5">
          <Label>Hora (opcional)</Label>
          <Input type="time" {...register('due_time')} disabled={!dueDate} />
        </div>
      </div>

      {/* Repetir — uma tarefa por ocorrência, criadas ao salvar (migration 52). */}
      <div className="space-y-1.5">
        <Label>Repetir</Label>
        <RecurrenceFields
          value={{
            recurrence_type: watch('recurrence_type'),
            recurrence_ends: watch('recurrence_ends'),
            recurrence_until: watch('recurrence_until'),
            recurrence_count: watch('recurrence_count'),
          }}
          onChange={(patch) => {
            // Revalida só depois da 1ª tentativa de salvar, como o resto do form.
            const opts = { shouldValidate: isSubmitted }
            if (patch.recurrence_type !== undefined) setValue('recurrence_type', patch.recurrence_type, opts)
            if (patch.recurrence_ends !== undefined) setValue('recurrence_ends', patch.recurrence_ends, opts)
            if (patch.recurrence_until !== undefined) setValue('recurrence_until', patch.recurrence_until, opts)
            if (patch.recurrence_count !== undefined) setValue('recurrence_count', patch.recurrence_count, opts)
          }}
          startDate={dueDate}
          pluralNoun="tarefas"
          errors={{
            recurrence_type: errors.recurrence_type?.message,
            recurrence_until: errors.recurrence_until?.message,
            recurrence_count: errors.recurrence_count?.message,
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Responsável</Label>
        <Select
          value={toSelectValue(assignedTo)}
          onValueChange={(v) => setValue('assigned_to', fromSelectValue(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {getDisplayName(p.full_name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar Tarefa
      </Button>
    </form>
  )
}
