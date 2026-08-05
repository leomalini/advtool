'use client'

import { useState } from 'react'
import {
  X,
  FileText,
  Scale,
  Clock,
  Construction,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import type { AreaJuridica } from '@/data/mock'
import { useWorkflows } from '../hooks/useWorkflows'
import type { CrmItemWithRelations } from '@/types/crmItem.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { useUpdateCrmItem } from '../hooks/useCrmItemMutations'
import { CrmItemTimeline } from './CrmItemTimeline'
import { CrmItemComments } from './CrmItemComments'
import { EntityEventsTab } from '@/features/agenda/components/EntityEventsTab'
import { EntityTasksTab } from '@/features/tarefas/components/EntityTasksTab'
import { CrmItemClienteTab } from './CrmItemClienteTab'

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

const TABS: { id: ModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'timeline', label: 'Timeline' },
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

function TabResumo({ caso }: { caso: CrmItemWithRelations }) {
  const area = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
  const { data: workflows = [] } = useWorkflows()
  const workflow = workflows.find((w) => w.id === caso.workflow_id)
  const coluna = workflow?.colunas.find((c) => c.id === caso.column_id)
  const clientName = getCrmItemClientName(caso)
  const assignedName = caso.assigned_profile?.full_name

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
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
              <p className="text-sm text-foreground">
                {workflow?.nome ?? '—'} <span className="text-muted-foreground">›</span> {coluna?.nome ?? '—'}
              </p>
            </div>
            {caso.notes && (
              <div>
                <SectionLabel>Observações</SectionLabel>
                <p className="text-sm text-muted-foreground leading-relaxed">{caso.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="space-y-5">
        {caso.legal_process && (
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Processo Vinculado
            </h4>
            <div className="p-3 rounded-lg border border-info/30 bg-info/5 space-y-1">
              <p className="font-mono text-xs text-foreground">
                {caso.legal_process.cnj_number ?? 'Sem CNJ cadastrado'}
              </p>
              {caso.legal_process.court && (
                <p className="text-xs text-muted-foreground">{caso.legal_process.court}</p>
              )}
            </div>
          </div>
        )}

        {caso.next_deadline && (
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Próximo Prazo
            </h4>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/25">
              <Clock className="w-4 h-4 text-warning flex-shrink-0" />
              <p className="text-sm font-medium text-warning">
                {formatDate(caso.next_deadline)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface CasoModalProps {
  caso: CrmItemWithRelations
  open: boolean
  onClose: () => void
  onEdit?: () => void
}

export function CasoModal({ caso, open, onClose, onEdit }: CasoModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('resumo')
  const { data: workflows = [] } = useWorkflows()
  const updateItem = useUpdateCrmItem(caso.id, caso.workflow_id)

  const area = caso.legal_area ? AREAS_JURIDICAS[caso.legal_area as AreaJuridica] : null
  const workflow = workflows.find((w) => w.id === caso.workflow_id)
  const coluna = workflow?.colunas.find((c) => c.id === caso.column_id)
  const clientName = getCrmItemClientName(caso)
  const assignedName = caso.assigned_profile?.full_name ?? ''

  // Only the card that *is* the processo (the one living in wf-processos) also
  // reads events/tasks linked straight to that processo — otherwise this card
  // wouldn't see anything created from the Processo modal. A Negociação card
  // linked to the same processo stays narrow: pulling every judicial record
  // into a sales pipeline card would be too broad.
  const readLegalProcessId =
    caso.workflow_id === 'wf-processos' ? caso.legal_process_id : null

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
      // z-40, not z-50: this is a hand-rolled overlay, and the Radix dialogs
      // opened from inside its tabs are z-50. Tying would leave stacking up to
      // DOM order, and DialogContent renders its overlay without forwarding
      // className — so it couldn't be raised from the call site.
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
            {/* Left: Title block */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <span>{workflow?.nome}</span>
                <span>›</span>
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: coluna?.cor }}
                />
                <span>{coluna?.nome}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground truncate">{clientName}</h2>
              {caso.title && caso.title !== clientName && (
                <p className="text-sm text-muted-foreground truncate">{caso.title}</p>
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

            {/* Right: Actions + Close */}
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
          {activeTab === 'resumo' && <TabResumo caso={caso} />}
          {activeTab === 'cliente' && (
            <CrmItemClienteTab
              client={caso.client}
              onLinkClient={(clientId) => updateItem.mutate({ client_id: clientId })}
              isLinking={updateItem.isPending}
            />
          )}
          {activeTab === 'timeline' && <CrmItemTimeline crmItemId={caso.id} itemLabel="caso" />}
          {activeTab === 'agenda' && (
            <EntityEventsTab
              legalProcessId={readLegalProcessId}
              crmItemIds={[caso.id]}
              lockedCrmItemId={caso.id}
              lockedLegalProcessId={caso.legal_process_id}
              lockedClientId={caso.client_id}
              itemLabel="caso"
            />
          )}
          {activeTab === 'tarefas' && (
            <EntityTasksTab
              legalProcessId={readLegalProcessId}
              crmItemIds={[caso.id]}
              lockedCrmItemId={caso.id}
              lockedLegalProcessId={caso.legal_process_id}
              lockedClientId={caso.client_id}
              itemLabel="caso"
            />
          )}
          {activeTab === 'documentos' && (
            <PlaceholderTab icon={<FileText className="w-8 h-8" />} label="Documentos" />
          )}
          {activeTab === 'financeiro' && (
            <PlaceholderTab icon={<Scale className="w-8 h-8" />} label="Financeiro" />
          )}
          {activeTab === 'comentarios' && (
            <CrmItemComments
              crmItemId={caso.id}
              entityTitle={getCrmItemClientName(caso)}
              itemLabel="caso"
            />
          )}
        </div>
      </div>
    </div>
  )
}
