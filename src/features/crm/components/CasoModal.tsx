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
  Phone,
  Mail,
  Building2,
  Clock,
  Construction,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS, WORKFLOWS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import type { CaseWithRelations } from '@/types/case.types'
import { getCaseClientName } from '@/types/case.types'

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalTab =
  | 'resumo'
  | 'timeline'
  | 'agenda'
  | 'tarefas'
  | 'documentos'
  | 'financeiro'
  | 'comentarios'
  | 'cliente'
  | 'processo'

const TABS: { id: ModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comentarios', label: 'Comentários' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'processo', label: 'Processo' },
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
    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm text-zinc-800">{value}</p>
    </div>
  )
}

function PlaceholderTab({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
      <div className="relative">
        {icon}
        <Construction className="w-4 h-4 absolute -bottom-1 -right-1 text-amber-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-600">Em desenvolvimento</p>
        <p className="text-xs text-zinc-400 mt-1">
          A aba <strong>{label}</strong> estará disponível em breve
        </p>
      </div>
    </div>
  )
}

// ── Tab: Resumo ───────────────────────────────────────────────────────────────

function TabResumo({ caso }: { caso: CaseWithRelations }) {
  const area = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflow_id)
  const coluna = workflow?.colunas.find((c) => c.id === caso.column_id)
  const clientName = getCaseClientName(caso)
  const assignedName = caso.assigned_profile?.full_name

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Informações do Caso
          </h4>
          <div className="space-y-3">
            <InfoRow label="Cliente" value={clientName} />
            {caso.client?.phone && <InfoRow label="Telefone" value={caso.client.phone} />}
            {caso.client?.email && <InfoRow label="E-mail" value={caso.client.email} />}
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
              <SectionLabel>Workflow / Etapa</SectionLabel>
              <p className="text-sm text-zinc-800">
                {workflow?.nome ?? '—'} <span className="text-zinc-400">›</span> {coluna?.nome ?? '—'}
              </p>
            </div>
            {caso.notes && (
              <div>
                <SectionLabel>Observações</SectionLabel>
                <p className="text-sm text-zinc-600 leading-relaxed">{caso.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Dados Processuais
          </h4>
          <div className="space-y-3">
            {caso.cnj_number ? (
              <InfoRow label="Número CNJ" value={caso.cnj_number} />
            ) : (
              <p className="text-sm text-zinc-400 italic">Sem processo judicial vinculado</p>
            )}
            <InfoRow label="Tribunal" value={caso.court} />
            <InfoRow label="Vara" value={caso.court_division} />
          </div>
        </div>

        {caso.next_deadline && (
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
              Próximo Prazo
            </h4>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-800">
                {formatDate(caso.next_deadline)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Cliente ──────────────────────────────────────────────────────────────

function TabCliente({ caso }: { caso: CaseWithRelations }) {
  const client = caso.client
  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Building2 className="w-8 h-8 mb-2" />
        <p className="text-sm">Nenhum cliente vinculado a este caso</p>
      </div>
    )
  }

  const displayName =
    client.type === 'individual'
      ? (client.name ?? '(sem nome)')
      : (client.trade_name ?? client.company_name ?? '(sem nome)')

  const area = client.legal_area ? AREAS_JURIDICAS[client.legal_area as AreaJuridica] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
        <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {displayName
            .split(' ')
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase()}
        </div>
        <div>
          <p className="text-base font-bold text-zinc-900">{displayName}</p>
          <p className="text-sm text-zinc-500">
            {client.type === 'individual' ? 'Pessoa Física' : 'Pessoa Jurídica'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Contato</h4>
          {client.phone && (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Phone className="w-4 h-4 text-zinc-400" />
              {client.phone}
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Mail className="w-4 h-4 text-zinc-400" />
              {client.email}
            </div>
          )}
          {!client.phone && !client.email && (
            <p className="text-sm text-zinc-400 italic">Sem contato cadastrado</p>
          )}
        </div>

        {area && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Área</h4>
            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
              {area.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Processo ─────────────────────────────────────────────────────────────

function TabProcesso({ caso }: { caso: CaseWithRelations }) {
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflow_id)
  const coluna = workflow?.colunas.find((c) => c.id === caso.column_id)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Identificação</h4>
          <div className="space-y-3">
            <InfoRow label="Número CNJ" value={caso.cnj_number ?? 'Não cadastrado'} />
            <InfoRow label="Tribunal" value={caso.court ?? 'Não definido'} />
            <InfoRow label="Vara" value={caso.court_division ?? 'Não definida'} />
            <div>
              <SectionLabel>Status Processual</SectionLabel>
              <p className="text-sm text-zinc-800">
                {workflow?.nome ?? '—'} · <span className="font-medium">{coluna?.nome ?? '—'}</span>
              </p>
            </div>
          </div>
        </div>

        {(caso.plaintiff || caso.defendant || caso.opposing_counsel) && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Partes</h4>
            <div className="space-y-3">
              <InfoRow label="Requerente" value={caso.plaintiff} />
              <InfoRow label="Requerido" value={caso.defendant} />
              <InfoRow label="Advogado da parte contrária" value={caso.opposing_counsel} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100">
          <SectionLabel>Criado em</SectionLabel>
          <p className="text-sm font-medium text-zinc-800">{formatDate(caso.created_at)}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100">
          <SectionLabel>Última atualização</SectionLabel>
          <p className="text-sm font-medium text-zinc-800">{formatDateTime(caso.updated_at)}</p>
        </div>
      </div>

      {/* Movements */}
      {caso.movements.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Movimentações ({caso.movements.length})
          </h4>
          <div className="space-y-2">
            {caso.movements.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border border-zinc-100 bg-white">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-zinc-500">{formatDateTime(m.movement_date)}</p>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    m.source === 'busca_processos'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-zinc-100 text-zinc-600'
                  )}>
                    {m.source === 'busca_processos' ? 'BuscaProcessos' : 'Manual'}
                  </span>
                </div>
                <p className="text-sm text-zinc-700">{m.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface CasoModalProps {
  caso: CaseWithRelations
  open: boolean
  onClose: () => void
  onEdit?: () => void
}

export function CasoModal({ caso, open, onClose, onEdit }: CasoModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('resumo')

  const area = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflow_id)
  const coluna = workflow?.colunas.find((c) => c.id === caso.column_id)
  const clientName = getCaseClientName(caso)
  const assignedName = caso.assigned_profile?.full_name ?? ''

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
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl"
        style={{ height: '90vh' }}
      >
        {/* ── Modal Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-zinc-100">
          <div className="flex items-start justify-between gap-4 mb-4">
            {/* Left: Title block */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-xs text-zinc-400">
                <span>{workflow?.nome}</span>
                <span>›</span>
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: coluna?.cor }}
                />
                <span>{coluna?.nome}</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 truncate">{clientName}</h2>
              {caso.title && caso.title !== clientName && (
                <p className="text-sm text-zinc-500 truncate">{caso.title}</p>
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
                    <span className="text-sm text-zinc-600">{assignedName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions + Close */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-all"
                >
                  Editar
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-all"
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
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'resumo' && <TabResumo caso={caso} />}
          {activeTab === 'cliente' && <TabCliente caso={caso} />}
          {activeTab === 'processo' && <TabProcesso caso={caso} />}
          {activeTab === 'timeline' && (
            <PlaceholderTab icon={<Activity className="w-8 h-8" />} label="Timeline" />
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
