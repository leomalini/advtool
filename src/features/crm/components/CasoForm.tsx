'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, FileText, SlidersHorizontal, Gavel } from 'lucide-react'
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
import { NONE_VALUE, toSelectValue, fromSelectValue } from '@/utils/select'
import { cn } from '@/lib/utils'
import { crmItemSchema, CRM_LEGAL_AREAS, CRM_TAGS } from '@/schemas/crmItem.schema'
import type { CrmItemInput, CrmTag, CrmLegalArea } from '@/schemas/crmItem.schema'
import type { CrmItemWithRelations } from '@/types/crmItem.types'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import { useWorkflows } from '../hooks/useWorkflows'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { useProfiles } from '@/hooks/useProfiles'
import { VincularProcessoField } from './VincularProcessoField'

// ── Primitives ────────────────────────────────────────────────────────────────

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

function SidebarLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </p>
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

// ── Color-dot trigger helper ──────────────────────────────────────────────────
// SelectValue can't reliably extract text from complex JSX children in
// controlled mode — it shows the raw value string. Render the label directly
// and fall back to SelectValue only when nothing is selected.

function ColorDotTriggerValue({
  color,
  label,
  placeholder,
}: {
  color?: string
  label?: string
  placeholder: string
}) {
  if (!label) return <SelectValue placeholder={placeholder} />
  return (
    <span className="flex items-center gap-2">
      {color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span>{label}</span>
    </span>
  )
}

// ── Tag toggle ────────────────────────────────────────────────────────────────

function TagToggle({
  tags,
  value,
  onChange,
}: {
  tags: readonly CrmTag[]
  value: CrmTag[]
  onChange: (tags: CrmTag[]) => void
}) {
  function toggle(tag: CrmTag) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const et = ETIQUETAS[tag]
        const active = value.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
              active
                ? cn(et.color, et.textColor, 'border-transparent')
                : 'bg-card border-border text-muted-foreground hover:border-border hover:bg-muted/40',
            )}
          >
            {et.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface CasoFormProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultValues?: Partial<CrmItemInput>
  editingCase?: CrmItemWithRelations | null
  isLoading?: boolean
  onSubmit: (data: CrmItemInput) => void
}

export function CasoForm({
  open,
  onClose,
  editingCase,
  isLoading = false,
  onSubmit,
  defaultValues,
}: CasoFormProps) {
  const isEditing = !!editingCase

  const { data: workflows = [] } = useWorkflows()
  const { data: profiles = [] } = useProfiles()

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CrmItemInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(crmItemSchema) as any,
    defaultValues: defaultValues ?? {
      workflow_id: 'wf-negociacao',
      column_id: 'neg-1',
      tags: [] as CrmTag[],
    },
  })

  useEffect(() => {
    if (open) {
      if (editingCase) {
        reset({
          title: editingCase.title ?? undefined,
          client_id: editingCase.client_id ?? undefined,
          legal_area: (editingCase.legal_area as CrmItemInput['legal_area']) ?? undefined,
          workflow_id: editingCase.workflow_id,
          column_id: editingCase.column_id,
          assigned_to: editingCase.assigned_to ?? undefined,
          tags: (editingCase.tags as CrmTag[]) ?? [],
          next_deadline: editingCase.next_deadline ?? undefined,
          next_task_summary: editingCase.next_task_summary ?? undefined,
          notes: editingCase.notes ?? undefined,
          legal_process_id: editingCase.legal_process_id ?? undefined,
        })
      } else {
        reset(
          defaultValues ?? {
            workflow_id: 'wf-negociacao',
            column_id: 'neg-1',
            tags: [] as CrmTag[],
          },
        )
      }
    }
  }, [open, editingCase, defaultValues, reset])

  const watchedWorkflowId = watch('workflow_id')
  const watchedColumnId = watch('column_id')
  const watchedClientId = watch('client_id')
  const watchedLegalArea = watch('legal_area')
  const watchedAssignedTo = watch('assigned_to')

  // Reset the etapa to the workflow's first column ONLY when the current column
  // doesn't belong to the selected workflow (i.e. the user switched workflows).
  // When editing an existing case, its column already belongs to the workflow,
  // so we must NOT overwrite it — that was resetting the select to the 1st etapa.
  useEffect(() => {
    const wf = workflows.find((w) => w.id === watchedWorkflowId)
    if (!wf) return
    const columnBelongs = wf.colunas.some((c) => c.id === watchedColumnId)
    if (!columnBelongs) {
      const firstCol = wf.colunas[0] // já ordenado pelo service
      if (firstCol) setValue('column_id', firstCol.id)
    }
  }, [watchedWorkflowId, watchedColumnId, setValue, workflows])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleFormSubmit(data: any) {
    onSubmit(data as CrmItemInput)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/*
        sm:max-w-5xl overrides the base sm:max-w-sm from DialogContent.
        p-0 gap-0 removes default padding/gap so we control layout internally.
      */}
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl max-h-[90vh] overflow-hidden p-0 gap-0"
      >
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col h-full max-h-[90vh]"
        >
          {/* ── Header ────────────────────────────────────────────────────── */}
          <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-border flex-shrink-0 gap-0">
            <DialogTitle className="text-sm font-semibold text-foreground">
              {isEditing ? 'Editar Caso' : 'Novo Caso'}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isLoading}>
                {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {isEditing ? 'Salvar alterações' : 'Cadastrar caso'}
              </Button>
            </div>
          </DialogHeader>

          {/* ── Body: sidebar + main ──────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* ── LEFT SIDEBAR — classificação e controle ─────────────────── */}
            <aside className="w-72 flex-shrink-0 border-r border-border overflow-y-auto bg-muted/40">
              <div className="p-5 space-y-5">

                {/* Workflow */}
                <div>
                  <SidebarLabel required>Workflow</SidebarLabel>
                  <Controller
                    name="workflow_id"
                    control={control}
                    render={({ field }) => {
                      const wf = workflows.find((w) => w.id === field.value)
                      return (
                        <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v) }}>
                          <SelectTrigger className="w-full text-sm bg-card">
                            <ColorDotTriggerValue
                              color={wf?.cor}
                              label={wf?.nome}
                              placeholder="Selecionar..."
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {workflows.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.cor }} />
                                  {w.nome}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    }}
                  />
                  <FieldError message={errors.workflow_id?.message} />
                </div>

                {/* Etapa */}
                <div>
                  <SidebarLabel required>Etapa</SidebarLabel>
                  <Controller
                    name="column_id"
                    control={control}
                    render={({ field }) => {
                      const wf = workflows.find((w) => w.id === watchedWorkflowId)
                      const col = wf?.colunas.find((c) => c.id === field.value)
                      return (
                        <Select
                          value={field.value}
                          onValueChange={(v) => { if (v) field.onChange(v) }}
                          disabled={!watchedWorkflowId}
                        >
                          <SelectTrigger className="w-full text-sm bg-card">
                            <ColorDotTriggerValue
                              color={col?.cor}
                              label={col?.nome}
                              placeholder="Selecionar etapa..."
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {wf?.colunas
                              .slice()
                              .sort((a, b) => a.posicao - b.posicao)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                                    {c.nome}
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )
                    }}
                  />
                  <FieldError message={errors.column_id?.message} />
                </div>

                {/* Área Jurídica */}
                <div>
                  <SidebarLabel>Área Jurídica</SidebarLabel>
                  <Controller
                    name="legal_area"
                    control={control}
                    render={({ field }) => {
                      const label = field.value
                        ? AREAS_JURIDICAS[field.value as keyof typeof AREAS_JURIDICAS]?.label
                        : undefined
                      return (
                        <Select
                          value={toSelectValue(field.value)}
                          onValueChange={(v) => field.onChange(fromSelectValue(v))}
                        >
                          <SelectTrigger className="w-full text-sm bg-card">
                            {label
                              ? <span className="truncate text-sm">{label}</span>
                              : <SelectValue placeholder="Selecionar área..." />}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>Não definida</SelectItem>
                            {CRM_LEGAL_AREAS.map((a) => (
                              <SelectItem key={a} value={a}>
                                {AREAS_JURIDICAS[a].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    }}
                  />
                </div>

                {/* Advogado Responsável */}
                <div>
                  <SidebarLabel>Advogado Responsável</SidebarLabel>
                  <Controller
                    name="assigned_to"
                    control={control}
                    render={({ field }) => {
                      const profile = profiles.find((p) => p.id === field.value)
                      return (
                        <Select
                          value={toSelectValue(field.value)}
                          onValueChange={(v) => field.onChange(fromSelectValue(v))}
                        >
                          <SelectTrigger className="w-full text-sm bg-card">
                            {profile
                              ? <span className="truncate text-sm">{profile.full_name}</span>
                              : <SelectValue placeholder="Selecionar..." />}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                            {profiles.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    }}
                  />
                </div>

                {/* Divider */}
                <div className="h-px bg-muted" />

                {/* Próximo Prazo */}
                <div>
                  <SidebarLabel required>Próximo Prazo</SidebarLabel>
                  <Input type="date" {...register('next_deadline')} className="bg-card" />
                  <FieldError message={errors.next_deadline?.message} />
                </div>

                {/* Próxima Tarefa */}
                <div>
                  <SidebarLabel>Próxima Tarefa</SidebarLabel>
                  <Input
                    {...register('next_task_summary')}
                    placeholder="Ex: Protocolar contestação"
                    className="bg-card"
                  />
                </div>

                {/* Divider */}
                <div className="h-px bg-muted" />

                {/* Etiquetas */}
                <div>
                  <SidebarLabel>Etiquetas</SidebarLabel>
                  <Controller
                    name="tags"
                    control={control}
                    render={({ field }) => (
                      <TagToggle
                        tags={CRM_TAGS}
                        value={(field.value ?? []) as CrmTag[]}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            </aside>

            {/* ── RIGHT MAIN — dados do caso ──────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-8">

                {/* ── Identificação ─────────────────────────────────────── */}
                <section>
                  <SectionDivider icon={FileText}>Identificação</SectionDivider>

                  <div className="space-y-4">
                    {/* Cliente */}
                    <div>
                      <FieldLabel>Cliente</FieldLabel>
                      <Controller
                        name="client_id"
                        control={control}
                        render={({ field }) => (
                          <ClienteCombobox
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Buscar cliente..."
                          />
                        )}
                      />
                    </div>

                    {/* Título */}
                    <div>
                      <FieldLabel required>Título do Caso</FieldLabel>
                      <Input
                        {...register('title')}
                        placeholder="Ex: Reclamação Trabalhista — João Silva vs Empresa XYZ"
                      />
                      <FieldError message={errors.title?.message} />
                    </div>
                  </div>
                </section>

                {/* ── Processo Vinculado ────────────────────────────────── */}
                <section>
                  <SectionDivider icon={Gavel}>Processo Vinculado</SectionDivider>
                  <Controller
                    name="legal_process_id"
                    control={control}
                    render={({ field }) => (
                      <VincularProcessoField
                        value={field.value ?? null}
                        onChange={field.onChange}
                        defaults={{
                          client_id: watchedClientId,
                          legal_area: watchedLegalArea as CrmLegalArea | null,
                          assigned_to: watchedAssignedTo,
                        }}
                      />
                    )}
                  />
                </section>

                {/* ── Observações ───────────────────────────────────────── */}
                <section>
                  <SectionDivider icon={SlidersHorizontal}>Observações</SectionDivider>
                  <Textarea
                    {...register('notes')}
                    rows={5}
                    placeholder="Informações relevantes sobre o caso, estratégia, pontos de atenção..."
                  />
                  <FieldError message={errors.notes?.message} />
                </section>
              </div>
            </main>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
