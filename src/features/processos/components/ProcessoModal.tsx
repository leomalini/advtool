'use client'

import { useState } from 'react'
import {
  X,
  Activity,
  Calendar,
  FileText,
  CheckSquare,
  Scale,
  Clock,
  Construction,
  Plus,
  Gavel,
  User,
  Phone,
  Mail,
  Landmark,
  Users2,
  History,
  Hash,
  StickyNote,
  TriangleAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { useAddLegalProcessMovement, useUpdateLegalProcess } from '../hooks/useLegalProcessMutations'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { CrmItemTimeline } from '@/features/crm/components/CrmItemTimeline'
import { CrmItemClienteTab } from '@/features/crm/components/CrmItemClienteTab'
import { CrmItemComments } from '@/features/crm/components/CrmItemComments'
import { EntityEventsTab } from '@/features/agenda/components/EntityEventsTab'
import { EntityTasksTab } from '@/features/tarefas/components/EntityTasksTab'
import { useEventsForEntity } from '@/features/agenda/hooks/useEvents'
import { useTasksForEntity } from '@/features/tarefas/hooks/useTasks'
import { format, parseISO, isBefore } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalTab =
  | 'resumo'
  | 'identificacao'
  | 'movimentacoes'
  | 'etapas'
  | 'agenda'
  | 'tarefas'
  | 'documentos'
  | 'financeiro'
  | 'comentarios'
  | 'cliente'

const TABS: { id: ModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'identificacao', label: 'Identificação' },
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'etapas', label: 'Etapas' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comentarios', label: 'Comentários' },
  { id: 'cliente', label: 'Cliente' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

/** Compact icon + label + value tile used for the Resumo tab's key-facts strip. */
function StatChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  tone?: 'default' | 'warning' | 'critical'
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3.5 py-3 min-w-0">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'critical' && 'bg-destructive/10 text-destructive',
          tone === 'warning' && 'bg-warning/10 text-warning',
          tone === 'default' && 'bg-accent text-accent-foreground'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-[13px] font-semibold truncate',
            tone === 'critical' && 'text-destructive',
            tone === 'warning' && 'text-warning',
            tone === 'default' && 'text-foreground'
          )}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

/** Icon-led key/value row used inside the Resumo tab's info cards. */
function InfoBlockRow({
  icon,
  label,
  value,
  showEmpty = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  /** When true, renders the row with a "—" placeholder instead of hiding it if `value` is missing. */
  showEmpty?: boolean
}) {
  if (!value && !showEmpty) return null
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-sm truncate', value ? 'text-foreground' : 'text-muted-foreground')}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

const PREVIEW_TONE_CLASSES = {
  info: 'bg-info/10 text-info',
  accent: 'bg-accent text-accent-foreground',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
} as const

function SummaryPreviewCard({
  icon,
  title,
  tone,
  lines,
  footer,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  tone: keyof typeof PREVIEW_TONE_CLASSES
  lines: string[]
  footer: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left p-3.5 rounded-xl border border-border bg-card hover:border-border/80 hover:shadow-sm transition-all group"
    >
      <span className="absolute top-2.5 right-2.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        Exemplo
      </span>
      <div className="flex items-center gap-2 mb-3 pr-14">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', PREVIEW_TONE_CLASSES[tone])}>
          {icon}
        </div>
        <span className="text-xs font-semibold text-foreground/90">{title}</span>
      </div>
      <ul className="space-y-1.5 mb-3">
        {lines.map((line) => (
          <li key={line} className="text-xs text-muted-foreground leading-snug truncate">
            {line}
          </li>
        ))}
      </ul>
      <span className="text-[11px] font-medium text-foreground/70">{footer}</span>
    </button>
  )
}

/** Shown when a processo has no linked crm_item — an integrity anomaly the
 * delete guard prevents, but that older data may still contain. The judicial
 * data (CNJ, tribunal, movimentações) stays readable; only the CRM-side
 * information and the tabs that depend on it are unavailable. */
function OrphanProcessoNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
      <TriangleAlert className="w-4 h-4 shrink-0 text-warning mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Processo sem caso vinculado</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Os dados de cliente, etapa, responsável e prazo vêm do caso no CRM, que foi removido.
          Os dados processuais continuam disponíveis nas abas Identificação e Movimentações.
        </p>
      </div>
    </div>
  )
}

function PlaceholderTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <div className="relative">
        {icon}
        <Construction className="w-4 h-4 absolute -bottom-1 -right-1 text-warning" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">Em desenvolvimento</p>
        <p className="text-xs text-muted-foreground mt-1">
          A aba <strong>{label}</strong> estará disponível em breve
        </p>
      </div>
    </div>
  )
}

// ── Tab: Resumo ───────────────────────────────────────────────────────────────

function TabResumo({
  processo,
  onNavigateTab,
}: {
  processo: LegalProcessWithRelations
  onNavigateTab: (tab: ModalTab) => void
}) {
  const item = processo.crm_item
  const area = item?.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
  const workflow = useWorkflow('wf-processos')

  // Same queries the Agenda/Tarefas tabs use — React Query dedupes them, so
  // the summary can't disagree with the tab it links to.
  const crmItemIds = processo.crm_items.map((c) => c.id)
  const { data: eventos = [] } = useEventsForEntity({
    legalProcessId: processo.id,
    crmItemIds,
  })
  const { data: tarefas = [] } = useTasksForEntity({
    legalProcessId: processo.id,
    crmItemIds,
  })

  const proximosEventos = eventos
    .filter((e) => !isBefore(parseISO(e.start_at), new Date()))
    .slice(0, 2)
    .map((e) => `${e.title} — ${format(parseISO(e.start_at), 'dd/MM')}`)
  const tarefasPendentes = tarefas.filter((t) => t.status !== 'done').slice(0, 2)
  const coluna = workflow?.colunas.find((c) => c.id === item?.column_id)
  const clientName = getCrmItemClientName(item)
  const assignedName = item?.assigned_profile?.full_name
  const prazoInfo = item?.next_deadline ? formatPrazo(item.next_deadline) : null

  return (
    <div className="space-y-7">
      {!item && <OrphanProcessoNotice />}

      {/* Key-facts strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatChip
          icon={<span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: coluna?.cor ?? '#9CA3AF' }} />}
          label="Etapa atual"
          value={coluna?.nome ?? '—'}
        />
        <StatChip
          icon={prazoInfo?.tone === 'critical' ? <Clock className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
          label="Próximo prazo"
          value={prazoInfo ? prazoInfo.label : 'Sem prazo definido'}
          tone={prazoInfo?.tone === 'critical' ? 'critical' : prazoInfo?.tone === 'warning' ? 'warning' : 'default'}
        />
        <StatChip icon={<User className="w-4 h-4" />} label="Advogado" value={assignedName ?? '—'} />
        <StatChip
          icon={<History className="w-4 h-4" />}
          label="Última atualização"
          value={item ? formatRelativeDate(item.updated_at) : '—'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left: Informações do Processo */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Informações do Processo
            </h4>
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium',
                area ? [area.bg, area.color] : 'bg-muted text-muted-foreground'
              )}
            >
              {area ? area.label : '—'}
            </span>
          </div>
          <div className="space-y-3.5">
            <InfoBlockRow icon={<User className="w-3.5 h-3.5" />} label="Cliente" value={clientName} showEmpty />
            <InfoBlockRow icon={<Phone className="w-3.5 h-3.5" />} label="Telefone" value={item?.client?.phone} showEmpty />
            <InfoBlockRow icon={<Mail className="w-3.5 h-3.5" />} label="E-mail" value={item?.client?.email} showEmpty />
          </div>
          {item?.notes && (
            <div className="flex items-start gap-2.5 pt-3.5 border-t border-border/70">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <StickyNote className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Observações</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{item.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Dados Processuais */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3.5">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Dados Processuais
          </h4>
          {processo.cnj_number ? (
            <InfoBlockRow icon={<Hash className="w-3.5 h-3.5" />} label="Número CNJ" value={processo.cnj_number} />
          ) : (
            <p className="text-sm text-muted-foreground italic">CNJ ainda não cadastrado</p>
          )}
          <InfoBlockRow icon={<Landmark className="w-3.5 h-3.5" />} label="Tribunal" value={processo.court} />
          <InfoBlockRow icon={<Gavel className="w-3.5 h-3.5" />} label="Vara" value={processo.court_division} />
          {(processo.plaintiff || processo.defendant) && (
            <InfoBlockRow
              icon={<Users2 className="w-3.5 h-3.5" />}
              label="Partes"
              value={[processo.plaintiff, processo.defendant].filter(Boolean).join(' × ') || null}
            />
          )}
        </div>
      </div>

      {/* Agenda e Tarefas agora vêm das mesmas queries que alimentam as abas —
          antes eram exemplos fixos, que passariam a contradizer a aba ao lado.
          Documentos e Financeiro seguem como prévia até as Fases 3 e 4. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Outras áreas do processo
          </h4>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryPreviewCard
            icon={<Calendar className="w-4 h-4" />}
            title="Agenda"
            tone="info"
            lines={
              proximosEventos.length > 0
                ? proximosEventos
                : ['Nenhum evento vinculado']
            }
            footer={`${eventos.length} evento${eventos.length === 1 ? '' : 's'}`}
            onClick={() => onNavigateTab('agenda')}
          />
          <SummaryPreviewCard
            icon={<CheckSquare className="w-4 h-4" />}
            title="Tarefas"
            tone="accent"
            lines={
              tarefasPendentes.length > 0
                ? tarefasPendentes.map((t) => t.title)
                : ['Nenhuma tarefa pendente']
            }
            footer={`${tarefasPendentes.length} pendente${tarefasPendentes.length === 1 ? '' : 's'}`}
            onClick={() => onNavigateTab('tarefas')}
          />
          <SummaryPreviewCard
            icon={<FileText className="w-4 h-4" />}
            title="Documentos"
            tone="warning"
            lines={['Em desenvolvimento']}
            footer="Fase 4"
            onClick={() => onNavigateTab('documentos')}
          />
          <SummaryPreviewCard
            icon={<Scale className="w-4 h-4" />}
            title="Financeiro"
            tone="success"
            lines={['Em desenvolvimento']}
            footer="Fase 3"
            onClick={() => onNavigateTab('financeiro')}
          />
        </div>
      </div>
    </div>
  )
}

// ── Tab: Identificação ────────────────────────────────────────────────────────

function TabIdentificacao({ processo }: { processo: LegalProcessWithRelations }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Identificação</h4>
          <div className="space-y-3">
            <InfoRow label="Número CNJ" value={processo.cnj_number ?? 'Não cadastrado'} />
            <InfoRow label="Tribunal" value={processo.court ?? 'Não definido'} />
            <InfoRow label="Vara" value={processo.court_division ?? 'Não definida'} />
          </div>
        </div>

        {(processo.plaintiff || processo.defendant || processo.opposing_counsel) && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Partes</h4>
            <div className="space-y-3">
              <InfoRow label="Requerente" value={processo.plaintiff} />
              <InfoRow label="Requerido" value={processo.defendant} />
              <InfoRow label="Advogado da parte contrária" value={processo.opposing_counsel} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-muted/40 border border-border">
          <SectionLabel>Criado em</SectionLabel>
          <p className="text-sm font-medium text-foreground">{formatDate(processo.created_at)}</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/40 border border-border">
          <SectionLabel>Última atualização</SectionLabel>
          <p className="text-sm font-medium text-foreground">{formatDateTime(processo.updated_at)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Movimentações ────────────────────────────────────────────────────────

function TabMovimentacoes({ processo }: { processo: LegalProcessWithRelations }) {
  const [description, setDescription] = useState('')
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const addMovement = useAddLegalProcessMovement(processo.id)

  const sorted = [...processo.movements].sort(
    (a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
  )

  function handleAdd() {
    if (!description.trim()) return
    addMovement.mutate(
      { description: description.trim(), movementDate: new Date(movementDate).toISOString() },
      { onSuccess: () => setDescription('') }
    )
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Adicionar movimentação
        </h4>
        <div className="flex gap-3">
          <input
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-card"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição da movimentação..."
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-card"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!description.trim() || addMovement.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Activity className="w-7 h-7" />
          <p className="text-sm">Nenhuma movimentação registrada ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => (
            <div key={m.id} className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">{formatDateTime(m.movement_date)}</p>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  m.source === 'busca_processos'
                    ? 'bg-info/15 text-info'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {m.source === 'busca_processos' ? 'BuscaProcessos' : 'Manual'}
                </span>
              </div>
              <p className="text-sm text-foreground/80">{m.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface ProcessoModalProps {
  processo: LegalProcessWithRelations
  open: boolean
  onClose: () => void
  onEdit?: () => void
}

export function ProcessoModal({ processo, open, onClose, onEdit }: ProcessoModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('resumo')
  const item = processo.crm_item
  const updateProcess = useUpdateLegalProcess(processo.id, item?.id ?? '')

  const area = item?.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
  const clientName = getCrmItemClientName(item)
  const assignedName = item?.assigned_profile?.full_name ?? ''

  const advInitials = assignedName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (!open) return null

  return (
    <div
      // z-40, not z-50 — see the note in CasoModal: nested Radix dialogs are
      // z-50 and their overlay className can't be overridden from here.
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative bg-card rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl"
        style={{ height: '90vh' }}
      >
        {/* ── Modal Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-border">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <Gavel className="w-3 h-3" />
                <span>Processo</span>
                {processo.cnj_number && (
                  <>
                    <span>›</span>
                    <span className="font-mono">{processo.cnj_number}</span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground truncate">{clientName}</h2>
              {item?.title && item.title !== clientName && (
                <p className="text-sm text-muted-foreground truncate">{item.title}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {area && (
                  <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
                    {area.label}
                  </span>
                )}
                {assignedName && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold bg-violet-500">
                      {advInitials}
                    </div>
                    <span className="text-sm text-muted-foreground">{assignedName}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-all"
                >
                  Editar
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground/80 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
                  activeTab === tab.id
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground/80 hover:border-border'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'resumo' && <TabResumo processo={processo} onNavigateTab={setActiveTab} />}
          {activeTab === 'identificacao' && <TabIdentificacao processo={processo} />}
          {activeTab === 'movimentacoes' && <TabMovimentacoes processo={processo} />}
          {activeTab === 'etapas' &&
            (item ? (
              <CrmItemTimeline crmItemId={item.id} itemLabel="processo" />
            ) : (
              <div className="py-10">
                <OrphanProcessoNotice />
              </div>
            ))}
          {activeTab === 'cliente' &&
            (item ? (
              <CrmItemClienteTab
                client={item.client}
                onLinkClient={(clientId) => updateProcess.mutate({ client_id: clientId })}
                isLinking={updateProcess.isPending}
              />
            ) : (
              <div className="py-10">
                <OrphanProcessoNotice />
              </div>
            ))}
          {/* Reads span the processo itself plus every linked card; writes go
              straight to the processo. Works even for an orphaned processo —
              legal_process_id doesn't depend on a crm_item existing. */}
          {activeTab === 'agenda' && (
            <EntityEventsTab
              legalProcessId={processo.id}
              crmItemIds={processo.crm_items.map((c) => c.id)}
              lockedLegalProcessId={processo.id}
              lockedClientId={item?.client_id}
              itemLabel="processo"
            />
          )}
          {activeTab === 'tarefas' && (
            <EntityTasksTab
              legalProcessId={processo.id}
              crmItemIds={processo.crm_items.map((c) => c.id)}
              lockedLegalProcessId={processo.id}
              lockedClientId={item?.client_id}
              itemLabel="processo"
            />
          )}
          {activeTab === 'documentos' && (
            <PlaceholderTab icon={<FileText className="w-8 h-8" />} label="Documentos" />
          )}
          {activeTab === 'financeiro' && (
            <PlaceholderTab icon={<Scale className="w-8 h-8" />} label="Financeiro" />
          )}
          {activeTab === 'comentarios' &&
            (item ? (
              // Writes go to the master item, reads span every linked card —
              // otherwise a comment left on a Negociação card would be
              // invisible here, splitting one conversation in two.
              <CrmItemComments
                crmItemId={item.id}
                readCrmItemIds={processo.crm_items.map((c) => c.id)}
                entityTitle={clientName}
                itemLabel="processo"
              />
            ) : (
              <div className="py-10">
                <OrphanProcessoNotice />
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
