'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Search, FileText, SlidersHorizontal } from 'lucide-react'
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
import { legalProcessSchema } from '@/schemas/legalProcess.schema'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import { CRM_LEGAL_AREAS, CRM_TAGS } from '@/schemas/crmItem.schema'
import type { CrmTag } from '@/schemas/crmItem.schema'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { useClientes } from '@/features/clientes/hooks/useClientes'
import { useProfiles } from '@/hooks/useProfiles'
import { formatCnjNumber } from '@/utils/cnj'
import { findLegalProcessByCnj } from '../services/legalProcesses.service'

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

interface ProcessoFormProps {
  open: boolean
  onClose: () => void
  defaultValues?: Partial<LegalProcessInput>
  editingProcess?: LegalProcessWithRelations | null
  isLoading?: boolean
  onSubmit: (data: LegalProcessInput) => void
}

export function ProcessoForm({
  open,
  onClose,
  editingProcess,
  isLoading = false,
  onSubmit,
  defaultValues,
}: ProcessoFormProps) {
  const isEditing = !!editingProcess
  const [lookingUpCnj, setLookingUpCnj] = useState(false)
  const lastFetchedCnjRef = useRef<string | null>(null)

  const workflow = useWorkflow('wf-processos')
  const { data: clients = [] } = useClientes()
  const { data: profiles = [] } = useProfiles()

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LegalProcessInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(legalProcessSchema) as any,
    defaultValues: defaultValues ?? {
      column_id: workflow?.colunas[0]?.id ?? '',
      tags: [] as CrmTag[],
    },
  })

  useEffect(() => {
    if (open) {
      if (editingProcess) {
        const item = editingProcess.crm_item
        lastFetchedCnjRef.current = editingProcess.cnj_number ?? null
        reset({
          title: item.title ?? undefined,
          client_id: item.client_id ?? undefined,
          legal_area: (item.legal_area as LegalProcessInput['legal_area']) ?? undefined,
          column_id: item.column_id,
          assigned_to: item.assigned_to ?? undefined,
          tags: (item.tags as CrmTag[]) ?? [],
          next_deadline: item.next_deadline ?? undefined,
          next_task_summary: item.next_task_summary ?? undefined,
          notes: item.notes ?? undefined,
          cnj_number: editingProcess.cnj_number ?? undefined,
          court: editingProcess.court ?? undefined,
          court_division: editingProcess.court_division ?? undefined,
          plaintiff: editingProcess.plaintiff ?? undefined,
          defendant: editingProcess.defendant ?? undefined,
          opposing_counsel: editingProcess.opposing_counsel ?? undefined,
        })
      } else {
        lastFetchedCnjRef.current = null
        reset(
          defaultValues ?? {
            column_id: workflow?.colunas[0]?.id ?? '',
            tags: [] as CrmTag[],
          },
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProcess, defaultValues, reset])

  const watchedCnjNumber = watch('cnj_number')

  // Auto-lookup: fires 600ms after the user stops typing a complete CNJ (20 digits)
  useEffect(() => {
    const cnj = watchedCnjNumber?.trim() ?? ''
    const digits = cnj.replace(/\D/g, '')

    if (digits.length !== 20) return
    if (cnj === lastFetchedCnjRef.current) return

    const controller = new AbortController()

    const timeout = setTimeout(async () => {
      lastFetchedCnjRef.current = cnj
      setLookingUpCnj(true)
      try {
        // Check our own database first — avoids an unnecessary BuscaProcessos
        // call when this processo is already tracked.
        const existing = await findLegalProcessByCnj(cnj)
        if (controller.signal.aborted) return

        if (existing) {
          setValue('court', existing.court ?? '')
          setValue('court_division', existing.court_division ?? '')
          setValue('plaintiff', existing.plaintiff ?? '')
          setValue('defendant', existing.defendant ?? '')
          setValue('opposing_counsel', existing.opposing_counsel ?? '')
          toast.info('Este CNJ já está cadastrado — dados preenchidos a partir do registro existente.')
          return
        }

        const res = await fetch(
          `/api/buscaprocessos/processos/${encodeURIComponent(cnj)}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return

        const json = await res.json()

        if (!res.ok) {
          toast.error(json.error ?? 'Processo não encontrado.')
          return
        }

        if (json.cnj_number) setValue('cnj_number', json.cnj_number)
        if (json.court) setValue('court', json.court)
        if (json.court_division) setValue('court_division', json.court_division)
        if (json.plaintiff) setValue('plaintiff', json.plaintiff)
        if (json.defendant) setValue('defendant', json.defendant)
        toast.success('Dados do processo preenchidos automaticamente.')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        toast.error('Erro ao consultar processo.')
      } finally {
        if (!controller.signal.aborted) setLookingUpCnj(false)
      }
    }, 600)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [watchedCnjNumber, setValue])

  function getClientDisplayName(client: (typeof clients)[number]): string {
    if (client.type === 'individual') return client.name ?? '(sem nome)'
    return client.trade_name ?? client.company_name ?? '(sem nome)'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleFormSubmit(data: any) {
    onSubmit(data as LegalProcessInput)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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
              {isEditing ? 'Editar Processo' : 'Novo Processo'}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isLoading}>
                {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {isEditing ? 'Salvar alterações' : 'Cadastrar processo'}
              </Button>
            </div>
          </DialogHeader>

          {/* ── Body: sidebar + main ──────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* ── LEFT SIDEBAR — classificação e controle ─────────────────── */}
            <aside className="w-72 flex-shrink-0 border-r border-border overflow-y-auto bg-muted/40">
              <div className="p-5 space-y-5">

                {/* Etapa (workflow fixo: Processos) */}
                <div>
                  <SidebarLabel required>Etapa</SidebarLabel>
                  <Controller
                    name="column_id"
                    control={control}
                    render={({ field }) => {
                      const col = workflow?.colunas.find((c) => c.id === field.value)
                      return (
                        <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v) }}>
                          <SelectTrigger className="w-full text-sm bg-card">
                            <ColorDotTriggerValue
                              color={col?.cor}
                              label={col?.nome}
                              placeholder="Selecionar etapa..."
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {workflow?.colunas
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
                        <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                          <SelectTrigger className="w-full text-sm bg-card">
                            {label
                              ? <span className="truncate text-sm">{label}</span>
                              : <SelectValue placeholder="Selecionar área..." />}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Não definida</SelectItem>
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
                        <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                          <SelectTrigger className="w-full text-sm bg-card">
                            {profile
                              ? <span className="truncate text-sm">{profile.full_name}</span>
                              : <SelectValue placeholder="Selecionar..." />}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhum</SelectItem>
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

            {/* ── RIGHT MAIN — dados do processo ──────────────────────────── */}
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
                        render={({ field }) => {
                          const selected = clients.find((c) => c.id === field.value)
                          const label = selected ? getClientDisplayName(selected) : undefined
                          return (
                            <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                              <SelectTrigger className="w-full text-sm">
                                {label
                                  ? <span className="truncate text-left">{label}</span>
                                  : <SelectValue placeholder="Selecionar cliente..." />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Nenhum</SelectItem>
                                {clients.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {getClientDisplayName(c)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        }}
                      />
                    </div>

                    {/* Título */}
                    <div>
                      <FieldLabel>Título do Processo</FieldLabel>
                      <Input
                        {...register('title')}
                        placeholder="Ex: Reclamação Trabalhista — João Silva vs Empresa XYZ"
                      />
                      <FieldError message={errors.title?.message} />
                    </div>
                  </div>
                </section>

                {/* ── Processo Judicial ─────────────────────────────────── */}
                <section>
                  <SectionDivider icon={Search}>Processo Judicial</SectionDivider>

                  <div className="space-y-4">
                    {/* CNJ Number */}
                    <div>
                      <FieldLabel required>Número CNJ</FieldLabel>
                      <div className="relative">
                        <Controller
                          name="cnj_number"
                          control={control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(formatCnjNumber(e.target.value))}
                              placeholder="0000000-00.0000.0.00.0000"
                              className={cn('font-mono pr-9', lookingUpCnj && 'text-muted-foreground')}
                              inputMode="numeric"
                            />
                          )}
                        />
                        {lookingUpCnj
                          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                          : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />}
                      </div>
                      <FieldError message={errors.cnj_number?.message} />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Ao digitar o número completo, os dados do processo são preenchidos automaticamente.
                      </p>
                    </div>

                    {/* Tribunal + Vara */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <FieldLabel>Tribunal</FieldLabel>
                        <Input {...register('court')} placeholder="Ex: TJSP" />
                      </div>
                      <div className="col-span-2">
                        <FieldLabel>Vara / Câmara</FieldLabel>
                        <Input {...register('court_division')} placeholder="Ex: 3ª Vara do Trabalho de São Paulo" />
                      </div>
                    </div>

                    {/* Partes */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <FieldLabel>Requerente / Autor</FieldLabel>
                        <Input {...register('plaintiff')} placeholder="Nome do requerente" />
                      </div>
                      <div>
                        <FieldLabel>Requerido / Réu</FieldLabel>
                        <Input {...register('defendant')} placeholder="Nome do requerido" />
                      </div>
                      <div>
                        <FieldLabel>Adv. da Parte Contrária</FieldLabel>
                        <Input {...register('opposing_counsel')} placeholder="Nome do advogado" />
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── Observações ───────────────────────────────────────── */}
                <section>
                  <SectionDivider icon={SlidersHorizontal}>Observações</SectionDivider>
                  <Textarea
                    {...register('notes')}
                    rows={5}
                    placeholder="Informações relevantes sobre o processo, estratégia, pontos de atenção..."
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
