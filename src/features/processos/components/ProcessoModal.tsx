'use client'

import { useState } from 'react'
import {
  X,
  Activity,
  Calendar,
  FileText,
  CheckSquare,
  Scale,
  MessageCircle,
  Clock,
  Construction,
  Plus,
  Gavel,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { useAddLegalProcessMovement, useUpdateLegalProcess } from '../hooks/useLegalProcessMutations'
import { CrmItemTimeline } from '@/features/crm/components/CrmItemTimeline'
import { CrmItemClienteTab } from '@/features/crm/components/CrmItemClienteTab'

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

function TabResumo({ processo }: { processo: LegalProcessWithRelations }) {
  const item = processo.crm_item
  const area = item.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
  const workflow = useWorkflow('wf-processos')
  const coluna = workflow?.colunas.find((c) => c.id === item.column_id)
  const clientName = getCrmItemClientName(item)
  const assignedName = item.assigned_profile?.full_name

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Informações do Processo
          </h4>
          <div className="space-y-3">
            <InfoRow label="Cliente" value={clientName} />
            {item.client?.phone && <InfoRow label="Telefone" value={item.client.phone} />}
            {item.client?.email && <InfoRow label="E-mail" value={item.client.email} />}
            {area && (
              <div>
                <SectionLabel>Área Jurídica</SectionLabel>
                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
                  {area.label}
                </span>
              </div>
            )}
            <InfoRow label="Advogado Responsável" value={assignedName} />
            <div>
              <SectionLabel>Etapa</SectionLabel>
              <p className="text-sm text-foreground">{coluna?.nome ?? '—'}</p>
            </div>
            {item.notes && (
              <div>
                <SectionLabel>Observações</SectionLabel>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Dados Processuais
          </h4>
          <div className="space-y-3">
            {processo.cnj_number ? (
              <InfoRow label="Número CNJ" value={processo.cnj_number} />
            ) : (
              <p className="text-sm text-muted-foreground italic">CNJ ainda não cadastrado</p>
            )}
            <InfoRow label="Tribunal" value={processo.court} />
            <InfoRow label="Vara" value={processo.court_division} />
          </div>
        </div>

        {item.next_deadline && (
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Próximo Prazo
            </h4>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/25">
              <Clock className="w-4 h-4 text-warning flex-shrink-0" />
              <p className="text-sm font-medium text-warning">
                {formatDate(item.next_deadline)}
              </p>
            </div>
          </div>
        )}
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
  const updateProcess = useUpdateLegalProcess(processo.id, item.id)

  const area = item.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
  const clientName = getCrmItemClientName(item)
  const assignedName = item.assigned_profile?.full_name ?? ''

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
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
              {item.title && item.title !== clientName && (
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
          {activeTab === 'resumo' && <TabResumo processo={processo} />}
          {activeTab === 'identificacao' && <TabIdentificacao processo={processo} />}
          {activeTab === 'movimentacoes' && <TabMovimentacoes processo={processo} />}
          {activeTab === 'etapas' && <CrmItemTimeline crmItemId={item.id} itemLabel="processo" />}
          {activeTab === 'cliente' && (
            <CrmItemClienteTab
              client={item.client}
              onLinkClient={(clientId) => updateProcess.mutate({ client_id: clientId })}
              isLinking={updateProcess.isPending}
            />
          )}
          {activeTab === 'agenda' && (
            <PlaceholderTab icon={<Calendar className="w-8 h-8" />} label="Agenda" />
          )}
          {activeTab === 'tarefas' && (
            <PlaceholderTab icon={<CheckSquare className="w-8 h-8" />} label="Tarefas" />
          )}
          {activeTab === 'documentos' && (
            <PlaceholderTab icon={<FileText className="w-8 h-8" />} label="Documentos" />
          )}
          {activeTab === 'financeiro' && (
            <PlaceholderTab icon={<Scale className="w-8 h-8" />} label="Financeiro" />
          )}
          {activeTab === 'comentarios' && (
            <PlaceholderTab icon={<MessageCircle className="w-8 h-8" />} label="Comentários" />
          )}
        </div>
      </div>
    </div>
  )
}
