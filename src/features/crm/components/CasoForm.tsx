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
import { caseSchema, CASE_LEGAL_AREAS, CASE_TAGS } from '@/schemas/case.schema'
import type { CaseInput, CaseTag } from '@/schemas/case.schema'
import type { CaseWithRelations } from '@/types/case.types'
import { AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import { useWorkflows } from '../hooks/useWorkflows'
import { useClientes } from '@/features/clientes/hooks/useClientes'
import { useProfiles } from '@/hooks/useProfiles'

// ── CNJ mask — NNNNNNN-DD.AAAA.J.TT.OOOO ─────────────────────────────────────

function formatCnjNumber(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 20)
  if (d.length <= 7)  return d
  if (d.length <= 9)  return `${d.slice(0, 7)}-${d.slice(7)}`
  if (d.length <= 13) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9)}`
  if (d.length <= 14) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13)}`
  if (d.length <= 16) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14)}`
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`
}

// ── Primitives ────────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-500 mt-1">{message}</p>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-800 bg-white',
        'placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-colors',
        'disabled:bg-zinc-50 disabled:text-zinc-400',
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
        'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-800 bg-white',
        'placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-none transition-colors',
        className,
      )}
      {...props}
    />
  )
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
      {children}
    </p>
  )
}

function SectionDivider({ icon: Icon, children }: { icon: React.ElementType; children: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-zinc-100">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
      </div>
      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{children}</span>
      <div className="flex-1 h-px bg-zinc-100" />
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
  tags: readonly CaseTag[]
  value: CaseTag[]
  onChange: (tags: CaseTag[]) => void
}) {
  function toggle(tag: CaseTag) {
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
                : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
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
  defaultValues?: Partial<CaseInput>
  editingCase?: CaseWithRelations | null
  isLoading?: boolean
  onSubmit: (data: CaseInput) => void
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
  const [lookingUpCnj, setLookingUpCnj] = useState(false)
  const lastFetchedCnjRef = useRef<string | null>(null)

  const { data: workflows = [] } = useWorkflows()
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
  } = useForm<CaseInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(caseSchema) as any,
    defaultValues: defaultValues ?? {
      workflow_id: 'wf-negociacao',
      column_id: 'neg-1',
      tags: [] as CaseTag[],
    },
  })

  useEffect(() => {
    if (open) {
      if (editingCase) {
        lastFetchedCnjRef.current = editingCase.cnj_number ?? null
        reset({
          title: editingCase.title ?? undefined,
          client_id: editingCase.client_id ?? undefined,
          cnj_number: editingCase.cnj_number ?? undefined,
          court: editingCase.court ?? undefined,
          court_division: editingCase.court_division ?? undefined,
          legal_area: (editingCase.legal_area as CaseInput['legal_area']) ?? undefined,
          workflow_id: editingCase.workflow_id,
          column_id: editingCase.column_id,
          assigned_to: editingCase.assigned_to ?? undefined,
          tags: (editingCase.tags as CaseTag[]) ?? [],
          next_deadline: editingCase.next_deadline ?? undefined,
          next_task_summary: editingCase.next_task_summary ?? undefined,
          plaintiff: editingCase.plaintiff ?? undefined,
          defendant: editingCase.defendant ?? undefined,
          opposing_counsel: editingCase.opposing_counsel ?? undefined,
          notes: editingCase.notes ?? undefined,
        })
      } else {
        lastFetchedCnjRef.current = null
        reset(
          defaultValues ?? {
            workflow_id: 'wf-negociacao',
            column_id: 'neg-1',
            tags: [] as CaseTag[],
          },
        )
      }
    }
  }, [open, editingCase, defaultValues, reset])

  const watchedWorkflowId = watch('workflow_id')
  const watchedCnjNumber = watch('cnj_number')

  // Reset column when workflow changes
  useEffect(() => {
    const wf = workflows.find((w) => w.id === watchedWorkflowId)
    if (wf) {
      const firstCol = wf.colunas[0] // já ordenado pelo service
      if (firstCol) setValue('column_id', firstCol.id)
    }
  }, [watchedWorkflowId, setValue, workflows])

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
    onSubmit(data as CaseInput)
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
          <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-zinc-100 flex-shrink-0 gap-0">
            <DialogTitle className="text-sm font-semibold text-zinc-900">
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
            <aside className="w-72 flex-shrink-0 border-r border-zinc-100 overflow-y-auto bg-zinc-50/40">
              <div className="p-5 space-y-5">

                {/* Workflow */}
                <div>
                  <SidebarLabel>Workflow</SidebarLabel>
                  <Controller
                    name="workflow_id"
                    control={control}
                    render={({ field }) => {
                      const wf = workflows.find((w) => w.id === field.value)
                      return (
                        <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v) }}>
                          <SelectTrigger className="w-full text-sm bg-white">
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
                  <SidebarLabel>Etapa</SidebarLabel>
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
                          <SelectTrigger className="w-full text-sm bg-white">
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
                        <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                          <SelectTrigger className="w-full text-sm bg-white">
                            {label
                              ? <span className="truncate text-sm">{label}</span>
                              : <SelectValue placeholder="Selecionar área..." />}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Não definida</SelectItem>
                            {CASE_LEGAL_AREAS.map((a) => (
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
                          <SelectTrigger className="w-full text-sm bg-white">
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
                <div className="h-px bg-zinc-200" />

                {/* Próximo Prazo */}
                <div>
                  <SidebarLabel>Próximo Prazo</SidebarLabel>
                  <Input type="date" {...register('next_deadline')} className="bg-white" />
                </div>

                {/* Próxima Tarefa */}
                <div>
                  <SidebarLabel>Próxima Tarefa</SidebarLabel>
                  <Input
                    {...register('next_task_summary')}
                    placeholder="Ex: Protocolar contestação"
                    className="bg-white"
                  />
                </div>

                {/* Divider */}
                <div className="h-px bg-zinc-200" />

                {/* Etiquetas */}
                <div>
                  <SidebarLabel>Etiquetas</SidebarLabel>
                  <Controller
                    name="tags"
                    control={control}
                    render={({ field }) => (
                      <TagToggle
                        tags={CASE_TAGS}
                        value={(field.value ?? []) as CaseTag[]}
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
                      <FieldLabel>Título do Caso</FieldLabel>
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
                      <FieldLabel>Número CNJ</FieldLabel>
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
                              className={cn('font-mono pr-9', lookingUpCnj && 'text-zinc-400')}
                              inputMode="numeric"
                            />
                          )}
                        />
                        {lookingUpCnj
                          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-400" />
                          : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />}
                      </div>
                      <FieldError message={errors.cnj_number?.message} />
                      <p className="text-xs text-zinc-400 mt-1.5">
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
