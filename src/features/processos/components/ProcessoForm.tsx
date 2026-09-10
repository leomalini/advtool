'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowUpRight, Check, Loader2, Search, FileText, SlidersHorizontal, Users } from 'lucide-react'
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
import { NONE_VALUE, toSelectValue, fromSelectValue } from '@/utils/select'
import { cn } from '@/lib/utils'
import { legalProcessSchema } from '@/schemas/legalProcess.schema'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import { CRM_LEGAL_AREAS, CRM_TAGS } from '@/schemas/crmItem.schema'
import type { CrmTag } from '@/schemas/crmItem.schema'
import type {
  LegalProcessWithRelations,
  LegalProcessPartyInput,
  MonitoringFrequency,
} from '@/types/legalProcess.types'
import {
  PROCESS_TYPE_LABELS,
  PROCESS_STATUS_LABELS,
  MONITORING_FREQUENCIES,
  MONITORING_FREQUENCY_LABELS,
} from '@/types/legalProcess.types'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { TagToggle } from '@/components/shared/TagToggle'
import { PartiesEditor } from './PartiesEditor'
import { AREAS_JURIDICAS } from '@/data/mock'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { useProfiles } from '@/hooks/useProfiles'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCnjNumber } from '@/utils/cnj'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { findLegalProcessByCnj, searchLegalProcessesByCnjPrefix } from '../services/legalProcesses.service'
import { lookupCnjViaApi } from '../services/cnjLookup'
import {
  CREATE_PROCESS_STEPS,
  CREATE_PROCESS_STEP_LABELS,
  type CreateProcessStep,
} from '../hooks/useLegalProcessMutations'

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

/** Só os dígitos: o mesmo processo aparece com e sem pontuação conforme quem
 * escreveu — e o preenchimento automático reescreve o campo no formato da API.
 * Comparar a string formatada daria falso negativo. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

// ── Main form ─────────────────────────────────────────────────────────────────

/** Campos que a consulta por CNJ preenche — e que, uma vez preenchidos, ficam
 * travados para que o cadastro não divirja do que o tribunal informa. */
type ApiFilledField =
  | 'court'
  | 'court_division'
  | 'plaintiff'
  | 'defendant'
  | 'procedural_class'
  | 'subject'
  | 'case_value'
  | 'filing_date'
  | 'status'

/** O que o formulário sabe e o gravador precisa, além dos campos. */
export interface ProcessoFormSubmitMeta {
  /** A busca automática consultou a capa na BuscaProcessos e preencheu os
   * campos. Evita que a sincronização pague pela mesma consulta de novo. */
  capaFetched: boolean
  /** Frequência escolhida para o monitoramento contínuo, ou `null` para não
   * monitorar. Viaja aqui, e não em `LegalProcessInput`, porque não é campo
   * que o formulário grava: quem preenche `monitoring_frequency` é a resposta
   * da BuscaProcessos. Só é lida no cadastro — na edição vem `null`, já que a
   * troca acontece na tela de detalhes. */
  monitoringFrequency: MonitoringFrequency | null
}

/**
 * Painel de progresso do cadastro.
 *
 * O cadastro encadeia quatro operações de rede e pode levar vários segundos —
 * com só um spinner no botão, a tela parece parada. Aqui cada etapa mostra em
 * qual delas está: concluída, em andamento ou por vir.
 */
function CreateProgress({
  step,
  withMonitoring,
}: {
  step: CreateProcessStep
  withMonitoring: boolean
}) {
  const steps = CREATE_PROCESS_STEPS.filter((s) => s !== 'monitoring' || withMonitoring)
  const currentIndex = steps.indexOf(step)

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[320px] rounded-xl border border-border bg-card p-5 shadow-lg">
        <p className="mb-4 text-sm font-semibold">Cadastrando processo</p>
        <ol className="space-y-3">
          {steps.map((s, index) => {
            const done = index < currentIndex
            const active = index === currentIndex
            return (
              <li key={s} className="flex items-center gap-2.5">
                {done ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span
                  className={cn(
                    'text-xs',
                    done && 'text-muted-foreground line-through',
                    active && 'font-medium text-foreground',
                    !done && !active && 'text-muted-foreground',
                  )}
                >
                  {CREATE_PROCESS_STEP_LABELS[s]}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
          A consulta ao tribunal pode demorar alguns segundos. Não feche esta janela.
        </p>
      </div>
    </div>
  )
}

interface ProcessoFormProps {
  open: boolean
  onClose: () => void
  defaultValues?: Partial<LegalProcessInput>
  editingProcess?: LegalProcessWithRelations | null
  isLoading?: boolean
  /** Etapa atual do cadastro. Ausente = sem painel de progresso (edição, e as
   * telas que ainda não acompanham o passo a passo). */
  createStep?: CreateProcessStep | null
  onSubmit: (data: LegalProcessInput, meta: ProcessoFormSubmitMeta) => void
}

export function ProcessoForm({
  open,
  onClose,
  editingProcess,
  isLoading = false,
  createStep = null,
  onSubmit,
  defaultValues,
}: ProcessoFormProps) {
  const isEditing = !!editingProcess
  const [lookingUpCnj, setLookingUpCnj] = useState(false)
  const lastFetchedCnjRef = useRef<string | null>(null)
  /** Dígitos do CNJ cuja capa a busca automática trouxe. Guardar o número, e
   * não um booleano, faz o dado expirar sozinho quando alguém troca o CNJ
   * depois da busca; guardar só os dígitos sobrevive à reformatação que o
   * próprio preenchimento faz no campo. */
  const capaFetchedForRef = useRef<string | null>(null)
  const [cnjSuggestions, setCnjSuggestions] = useState<LegalProcessWithRelations[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [duplicateProcess, setDuplicateProcess] = useState<LegalProcessWithRelations | null>(null)
  /** Fora do react-hook-form de propósito: não é campo de `legalProcessSchema`
   * — o monitoramento é criado na BuscaProcessos depois do insert. */
  const [monitoringFrequency, setMonitoringFrequency] = useState<MonitoringFrequency | null>(null)
  /** Campos preenchidos pela consulta por CNJ. Ficam travados enquanto
   * `apiUnlocked` for falso. */
  const [apiFilled, setApiFilled] = useState<Set<ApiFilledField>>(new Set())
  /** Escape hatch: a capa do tribunal às vezes vem incompleta ou errada, e um
   * cadastro que não pode ser corrigido é pior que um divergente. */
  const [apiUnlocked, setApiUnlocked] = useState(false)

  const isApiLocked = (field: ApiFilledField) => !apiUnlocked && apiFilled.has(field)

  const workflow = useWorkflow('wf-processos')
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
    defaultValues: {
      column_id: workflow?.colunas[0]?.id ?? '',
      tags: [] as CrmTag[],
      cnj_number: '',
      ...defaultValues,
    },
  })

  useEffect(() => {
    if (open) {
      setMonitoringFrequency(null)
      setApiFilled(new Set())
      setApiUnlocked(false)
      if (editingProcess) {
        const item = editingProcess.crm_item
        lastFetchedCnjRef.current = editingProcess.cnj_number ?? null
        reset({
          title: item?.title ?? undefined,
          client_id: item?.client_id ?? undefined,
          legal_area: (item?.legal_area as LegalProcessInput['legal_area']) ?? undefined,
          column_id: item?.column_id ?? workflow?.colunas[0]?.id ?? '',
          assigned_to: item?.assigned_to ?? undefined,
          tags: (item?.tags as CrmTag[]) ?? [],
          next_deadline: item?.next_deadline ?? undefined,
          next_task_summary: item?.next_task_summary ?? undefined,
          notes: item?.notes ?? undefined,
          cnj_number: editingProcess.cnj_number ?? '',
          court: editingProcess.court ?? undefined,
          court_division: editingProcess.court_division ?? undefined,
          plaintiff: editingProcess.plaintiff ?? undefined,
          defendant: editingProcess.defendant ?? undefined,
          opposing_counsel: editingProcess.opposing_counsel ?? undefined,
          process_type: editingProcess.process_type,
          status: editingProcess.status,
          procedural_class: editingProcess.procedural_class ?? undefined,
          subject: editingProcess.subject ?? undefined,
          comarca: editingProcess.comarca ?? undefined,
          case_value: editingProcess.case_value ?? undefined,
          filing_date: editingProcess.filing_date ?? undefined,
          // `client_id` viaja de volta para que salvar o formulário não
          // desfaça um vínculo feito no popover da tela de detalhes.
          parties: (editingProcess.parties ?? []).map((p) => ({
            name: p.name,
            document: p.document,
            polo: p.polo,
            party_type: p.party_type,
            position: p.position,
            client_id: p.client_id,
          })),
        })
      } else {
        lastFetchedCnjRef.current = null
        reset({
          column_id: workflow?.colunas[0]?.id ?? '',
          tags: [] as CrmTag[],
          cnj_number: '',
          ...defaultValues,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProcess, defaultValues, reset])

  const watchedCnjNumber = watch('cnj_number')
  const debouncedCnjNumber = useDebounce(watchedCnjNumber ?? '', 300)

  // Incremental search on our own base as the user types (from 4+ digits) — surfaces
  // already-tracked processos before the number is even complete.
  useEffect(() => {
    const cnj = debouncedCnjNumber.trim()
    const digits = cnj.replace(/\D/g, '')
    const shouldSearch = digits.length >= 4 && digits.length !== 20
    let cancelled = false

    if (digits.length !== 20) {
      setDuplicateProcess(null)
    }

    const task = shouldSearch
      ? searchLegalProcessesByCnjPrefix(cnj)
      : Promise.resolve<LegalProcessWithRelations[]>([])

    task
      .then((results) => {
        if (cancelled) return
        setCnjSuggestions(results)
        setSuggestionsOpen(results.length > 0)
      })
      .catch(() => {
        if (!cancelled) setCnjSuggestions([])
      })

    return () => {
      cancelled = true
    }
  }, [debouncedCnjNumber])

  // Auto-lookup: fires 600ms after the user stops typing a complete CNJ (20 digits)
  useEffect(() => {
    const cnj = watchedCnjNumber?.trim() ?? ''
    const digits = cnj.replace(/\D/g, '')

    // Trocou o CNJ: o que a capa anterior preencheu não vale mais, e manter os
    // campos travados prenderia o cadastro novo aos dados do processo velho.
    if (capaFetchedForRef.current && digits !== capaFetchedForRef.current) {
      capaFetchedForRef.current = null
      setApiFilled(new Set())
      setApiUnlocked(false)
    }

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
          const isSelf = isEditing && existing.id === editingProcess?.id
          if (isSelf) {
            setDuplicateProcess(null)
          } else {
            // CNJ must be unique — block saving instead of merging into the existing record.
            setDuplicateProcess(existing)
            toast.error('Este número de processo já está cadastrado.')
          }
          return
        }

        setDuplicateProcess(null)

        const outcome = await lookupCnjViaApi(cnj, controller.signal)
        if (controller.signal.aborted) return

        if (outcome.status === 'error') {
          toast.error(outcome.message)
          return
        }

        // Ainda processando quando as tentativas acabaram: soltar o ref deixa
        // a pessoa disparar a consulta de novo com o mesmo número.
        if (outcome.status === 'pending') {
          lastFetchedCnjRef.current = null
          toast.info(outcome.message)
          return
        }

        const payload = outcome.data
        capaFetchedForRef.current = digitsOf(cnj)

        // Só os campos que a API realmente preencheu entram na trava — o que
        // ela deixou vazio continua editável.
        const preenchidos = new Set<ApiFilledField>()
        const fill = <K extends ApiFilledField>(field: K, value: unknown) => {
          if (value == null || value === '') return
          setValue(field, value as never)
          preenchidos.add(field)
        }

        // O CNJ NÃO entra na trava: é o que a pessoa digitou, e travá-lo
        // impediria de corrigir o número ou buscar outro processo sem fechar o
        // formulário. A API só o reescreve no formato canônico.
        if (payload.cnj_number) setValue('cnj_number', payload.cnj_number)
        fill('court', payload.court)
        fill('court_division', payload.court_division)
        fill('plaintiff', payload.plaintiff)
        fill('defendant', payload.defendant)
        fill('procedural_class', payload.procedural_class)
        fill('subject', payload.subject)
        fill('case_value', payload.case_value)
        fill('filing_date', payload.filing_date)
        fill('status', payload.status)
        setApiFilled(preenchidos)
        // A API é a fonte das partes: substitui a lista inteira em vez de
        // concatenar, senão uma segunda consulta duplicaria todo mundo.
        if (payload.parties?.length) setValue('parties', payload.parties)
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
  }, [watchedCnjNumber, setValue, isEditing, editingProcess])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleFormSubmit(data: any) {
    if (duplicateProcess) {
      toast.error('Não é possível salvar: número de processo já cadastrado.')
      return
    }

    const capaFetched =
      Boolean(capaFetchedForRef.current) &&
      capaFetchedForRef.current === digitsOf(data.cnj_number ?? '')

    // Na edição o campo nem é exibido: trocar a frequência de um monitoramento
    // que já existe é cancelar e recriar, e isso vive na tela de detalhes.
    onSubmit(data as LegalProcessInput, {
      capaFetched,
      monitoringFrequency: isEditing ? null : monitoringFrequency,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        // Sem `relative` aqui: a base do DialogContent é `fixed`, que o
        // tailwind-merge trata no mesmo grupo de `position` — passar `relative`
        // vencia a base e jogava metade do modal para fora da tela. `fixed` já
        // é elemento posicionado, então o overlay `absolute inset-0` ancora
        // nele do mesmo jeito.
        className="sm:max-w-5xl max-h-[90vh] overflow-hidden p-0 gap-0"
      >
        {createStep && (
          <CreateProgress step={createStep} withMonitoring={Boolean(monitoringFrequency)} />
        )}
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
              <Button type="submit" size="sm" disabled={isLoading || !!duplicateProcess}>
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
                        allowCreate
                      />
                    )}
                  />
                </div>

                {/* Monitoramento — só no cadastro. Já existindo monitoramento,
                    trocar a frequência exige cancelar e recriar, o que é feito
                    na tela de detalhes. */}
                {!isEditing && (
                  <>
                    <div className="h-px bg-muted" />
                    <div>
                      <SidebarLabel>Monitoramento</SidebarLabel>
                      <Select
                        value={monitoringFrequency ?? NONE_VALUE}
                        onValueChange={(v) =>
                          setMonitoringFrequency(
                            v === NONE_VALUE ? null : (v as MonitoringFrequency),
                          )
                        }
                      >
                        <SelectTrigger className="w-full text-sm bg-card">
                          <span className="truncate text-sm">
                            {monitoringFrequency
                              ? MONITORING_FREQUENCY_LABELS[monitoringFrequency]
                              : 'Não monitorar'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Não monitorar</SelectItem>
                          {MONITORING_FREQUENCIES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {MONITORING_FREQUENCY_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                        Acompanha novas movimentações deste processo no tribunal.
                      </p>
                    </div>
                  </>
                )}
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

                  {/* Trava dos campos vindos da capa. O botão existe porque a
                      capa às vezes vem incompleta ou errada — um cadastro que
                      não pode ser corrigido é pior que um divergente. */}
                  {apiFilled.size > 0 && (
                    <div
                      className={cn(
                        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
                        apiUnlocked
                          ? 'border-warning/40 bg-warning/[0.07]'
                          : 'border-info/40 bg-info/[0.07]',
                      )}
                    >
                      <span className="text-xs text-foreground/80">
                        {apiUnlocked
                          ? 'Campos destravados — o que você alterar pode divergir do tribunal.'
                          : `${apiFilled.size} campo(s) preenchido(s) pelo tribunal estão travados.`}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        onClick={() => setApiUnlocked((v) => !v)}
                      >
                        {apiUnlocked ? 'Travar novamente' : 'Editar mesmo assim'}
                      </Button>
                    </div>
                  )}

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
                              onFocus={() => setSuggestionsOpen(cnjSuggestions.length > 0)}
                              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                              placeholder="0000000-00.0000.0.00.0000"
                              className={cn('font-mono pr-9', lookingUpCnj && 'text-muted-foreground')}
                              inputMode="numeric"
                            />
                          )}
                        />
                        {lookingUpCnj
                          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                          : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />}

                        {suggestionsOpen && cnjSuggestions.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-md py-1">
                            <p className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Já cadastrados
                            </p>
                            {cnjSuggestions.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onMouseDown={() => {
                                  setValue('cnj_number', s.cnj_number ?? '')
                                  setSuggestionsOpen(false)
                                }}
                                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                              >
                                <span className="text-sm font-mono">{s.cnj_number}</span>
                                <span className="text-xs text-muted-foreground truncate w-full">
                                  {getCrmItemClientName(s.crm_item)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <FieldError message={errors.cnj_number?.message} />
                      {duplicateProcess ? (
                        <div className="flex items-start gap-2 mt-1.5 p-2.5 rounded-lg bg-destructive/10 border border-destructive/25">
                          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-destructive">
                              Este número de processo já está cadastrado
                              {getCrmItemClientName(duplicateProcess.crm_item) ? ` para ${getCrmItemClientName(duplicateProcess.crm_item)}` : ''}.
                            </p>
                            <Link
                              href={`/processos?id=${duplicateProcess.id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline mt-0.5"
                            >
                              Ver processo existente
                              <ArrowUpRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Ao digitar o número completo, os dados do processo são preenchidos automaticamente.
                        </p>
                      )}
                    </div>

                    {/* Tipo + Status */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <FieldLabel>Tipo</FieldLabel>
                        <Controller
                          name="process_type"
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value ?? 'judicial'}
                              onValueChange={(v) => { if (v) field.onChange(v) }}
                            >
                              <SelectTrigger className="w-full text-sm">
                                <span className="truncate text-sm">
                                  {PROCESS_TYPE_LABELS[field.value ?? 'judicial']}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(PROCESS_TYPE_LABELS) as (keyof typeof PROCESS_TYPE_LABELS)[]).map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {PROCESS_TYPE_LABELS[t]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <FieldLabel>Situação</FieldLabel>
                        <Controller
                          name="status"
                          control={control}
                          render={({ field }) => (
                            <Select
                              value={field.value ?? 'ativo'}
                              disabled={isApiLocked('status')}
                              onValueChange={(v) => { if (v) field.onChange(v) }}
                            >
                              <SelectTrigger className="w-full text-sm">
                                <span className="truncate text-sm">
                                  {PROCESS_STATUS_LABELS[field.value ?? 'ativo']}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(PROCESS_STATUS_LABELS) as (keyof typeof PROCESS_STATUS_LABELS)[]).map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {PROCESS_STATUS_LABELS[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>

                    {/* Classe + Assunto — o subtítulo do cabeçalho da tela de detalhes */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <FieldLabel>Classe Processual</FieldLabel>
                        <Input
                          {...register('procedural_class')}
                          disabled={isApiLocked('procedural_class')}
                          placeholder="Ex: Procedimento Comum Cível"
                        />
                        <FieldError message={errors.procedural_class?.message} />
                      </div>
                      <div>
                        <FieldLabel>Assunto</FieldLabel>
                        <Input
                          {...register('subject')}
                          disabled={isApiLocked('subject')}
                          placeholder="Ex: Indenização por Dano Moral"
                        />
                        <FieldError message={errors.subject?.message} />
                      </div>
                    </div>

                    {/* Valor da causa + Ajuizamento + Comarca */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <FieldLabel>Valor da Causa</FieldLabel>
                        <Controller
                          name="case_value"
                          control={control}
                          render={({ field }) => (
                            <CurrencyInput
                              value={field.value ?? undefined}
                              onChange={(v) => field.onChange(v ?? null)}
                              disabled={isApiLocked('case_value')}
                              className="h-[38px] rounded-lg"
                            />
                          )}
                        />
                        <FieldError message={errors.case_value?.message} />
                      </div>
                      <div>
                        <FieldLabel>Ajuizamento</FieldLabel>
                        <Input type="date" {...register('filing_date')} disabled={isApiLocked('filing_date')} />
                        <FieldError message={errors.filing_date?.message} />
                      </div>
                      <div>
                        <FieldLabel>Comarca</FieldLabel>
                        <Input {...register('comarca')} placeholder="Ex: São Paulo" />
                      </div>
                    </div>

                    {/* Tribunal + Juízo */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <FieldLabel>Tribunal</FieldLabel>
                        <Input {...register('court')} disabled={isApiLocked('court')} placeholder="Ex: TJSP" />
                      </div>
                      <div className="col-span-2">
                        <FieldLabel>Juízo / Vara</FieldLabel>
                        <Input
                          {...register('court_division')}
                          disabled={isApiLocked('court_division')}
                          placeholder="Ex: 3ª Vara do Trabalho de São Paulo"
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Adv. da Parte Contrária</FieldLabel>
                      <Input {...register('opposing_counsel')} placeholder="Nome do advogado" />
                    </div>
                  </div>
                </section>

                {/* ── Partes ────────────────────────────────────────────── */}
                <section>
                  <SectionDivider icon={Users}>Partes</SectionDivider>
                  <Controller
                    name="parties"
                    control={control}
                    render={({ field }) => (
                      <PartiesEditor
                        value={(field.value ?? []) as LegalProcessPartyInput[]}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {/* Erros de parte são por linha, e o array não carrega
                      mensagem própria — o editor marca o campo em vermelho e
                      isto explica por que o salvamento não foi adiante. */}
                  <FieldError
                    message={
                      errors.parties
                        ? 'Revise os documentos das partes: informe CPF ou CNPJ completo, ou deixe em branco.'
                        : undefined
                    }
                  />
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
