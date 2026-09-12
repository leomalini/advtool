'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  Copy,
  FileText,
  IdCard,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Scale,
  Tag,
  User,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { InfoStripItem, ActionCard } from '@/components/shared/DetailStrip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CrmTag } from '@/schemas/crmItem.schema'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import type { CreateTaskInput } from '@/schemas/task.schema'
import {
  getClientDisplayName,
  ADDRESS_KIND_LABELS,
  getClientDocument,
  SEX_LABELS,
  MARITAL_STATUS_LABELS,
} from '@/types/cliente.types'
import type { ClientWithRelations } from '@/types/cliente.types'
import { getCrmItemDisplayTitle } from '@/types/crmItem.types'
import { formatDocument } from '@/utils/format'
import { formatDate } from '@/utils/date'
import { getInitials } from '@/utils/profile'
import { useCliente, useClientComments, useClientesPendencies } from '../hooks/useClientes'
import { useUpdateCliente } from '../hooks/useClienteMutations'
import { buildQualificacao, formatAddressLine, getClientAge } from '../utils/qualificacao'
import { ClienteForm } from './ClienteForm'
import { LegalAreaBadges } from './LegalAreaBadges'
import { ClientComments } from './ClientComments'
import { useLegalProcessesByClient } from '@/features/processos/hooks/useLegalProcesses'
import { useCrmItemsByClient } from '@/features/crm/hooks/useCrmItems'
import { useWorkflows } from '@/features/crm/hooks/useWorkflows'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { EntityEventsTab } from '@/features/agenda/components/EntityEventsTab'
import { EntityTasksTab } from '@/features/tarefas/components/EntityTasksTab'
import { DocumentsTab } from '@/features/documentos/components/DocumentsTab'
import { FinancialEntriesTab } from '@/features/financeiro/components/FinancialEntriesTab'
import { useTasksForEntity } from '@/features/tarefas/hooks/useTasks'
import { useCreateTask } from '@/features/tarefas/hooks/useTaskMutations'
import { TaskForm } from '@/features/tarefas/components/TaskForm'
import { tagAppearance } from '@/utils/tags'

type Tab =
  | 'cadastro'
  | 'atividades'
  | 'agenda'
  | 'processos'
  | 'casos'
  | 'financeiro'
  | 'arquivos'
  | 'pendencias'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'atividades', label: 'Atividades e Notas' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'processos', label: 'Processos' },
  { id: 'casos', label: 'Casos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'pendencias', label: 'Pendências' },
]

// ── Sub-componentes ───────────────────────────────────────────────────────────

/** Valor com botão de copiar — a tela existe em boa parte para alimentar
 * petições, e cada campo é copiado isoladamente o tempo todo. */
function CopyableValue({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <span className="group inline-flex items-center gap-1.5 min-w-0">
      <span className={cn('truncate', mono && 'font-mono')}>{value}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value)
          toast.success('Copiado')
        }}
        title="Copiar"
        className="shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
      >
        <Copy className="h-3 w-3" />
      </button>
    </span>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

function DataSection({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  )
}

function EmptyTab({ icon, message, hint }: { icon: React.ReactNode; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      {icon}
      <p className="text-sm font-medium">{message}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  )
}

// ── Aba: Cadastro ─────────────────────────────────────────────────────────────

function CadastroTab({ cliente }: { cliente: ClientWithRelations }) {
  const isPF = cliente.type === 'individual'
  const qualificacao = buildQualificacao(cliente)
  const age = getClientAge(cliente.birth_date)
  const areas = cliente.legal_areas ?? []

  const addresses = cliente.addresses ?? []

  return (
    <div className="space-y-4">
      <DataSection
        icon={<Scale className="h-3.5 w-3.5" />}
        title="Qualificação completa"
        action={
          qualificacao ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(qualificacao)
                toast.success('Qualificação copiada')
              }}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </Button>
          ) : undefined
        }
      >
        <div className="p-4">
          {qualificacao ? (
            <>
              <p className="text-sm leading-relaxed text-foreground">{qualificacao}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Gerada a partir do cadastro — complete os campos para enriquecê-la.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem dados suficientes para gerar a qualificação.
            </p>
          )}
        </div>
      </DataSection>

      <DataSection icon={<User className="h-3.5 w-3.5" />} title="Informações pessoais">
        <DataRow label="Tipo de cadastro">{isPF ? 'Pessoa Física' : 'Pessoa Jurídica'}</DataRow>
        <DataRow label={isPF ? 'Nome' : 'Razão social'}>
          <CopyableValue value={(isPF ? cliente.name : cliente.company_name) ?? '—'} />
        </DataRow>
        {!isPF && cliente.trade_name && (
          <DataRow label="Nome fantasia">
            <CopyableValue value={cliente.trade_name} />
          </DataRow>
        )}
        <DataRow label="CPF/CNPJ">
          {getClientDocument(cliente) ? (
            <CopyableValue value={formatDocument(getClientDocument(cliente))} mono />
          ) : (
            '—'
          )}
        </DataRow>
        {isPF && (
          <>
            <DataRow label="Data de nascimento">
              {cliente.birth_date
                ? `${formatDate(cliente.birth_date)}${age != null ? ` (${age} anos)` : ''}`
                : '—'}
            </DataRow>
            <DataRow label="Sexo">{cliente.sex ? SEX_LABELS[cliente.sex] : '—'}</DataRow>
            <DataRow label="Nacionalidade">{cliente.nationality || '—'}</DataRow>
            <DataRow label="Estado civil">
              {cliente.marital_status ? MARITAL_STATUS_LABELS[cliente.marital_status] : '—'}
            </DataRow>
            <DataRow label="Profissão">{cliente.profession || '—'}</DataRow>
            <DataRow label="RG">
              {cliente.rg ? (
                <CopyableValue
                  value={[cliente.rg, cliente.rg_issuer].filter(Boolean).join(' ')}
                  mono
                />
              ) : (
                '—'
              )}
            </DataRow>
          </>
        )}
        {!isPF && cliente.contact_person && (
          <DataRow label="Contato responsável">{cliente.contact_person}</DataRow>
        )}
        <DataRow label={areas.length > 1 ? 'Áreas jurídicas' : 'Área jurídica'}>
          <LegalAreaBadges areas={areas} empty="—" />
        </DataRow>
        <DataRow label="Advogado responsável">
          {cliente.assignee ? cliente.assignee.full_name : '—'}
        </DataRow>
        <DataRow label="Cliente desde">{formatDate(cliente.created_at)}</DataRow>
      </DataSection>

      <DataSection icon={<Phone className="h-3.5 w-3.5" />} title="Contato">
        <DataRow label="Telefone principal">
          {cliente.phone ? <CopyableValue value={cliente.phone} /> : '—'}
        </DataRow>
        <DataRow label="E-mail principal">
          {cliente.email ? <CopyableValue value={cliente.email} /> : '—'}
        </DataRow>
        {(cliente.contacts ?? []).map((contact) => (
          <DataRow key={contact.id} label={contact.label || (contact.type === 'phone' ? 'Telefone' : 'E-mail')}>
            <CopyableValue value={contact.value} />
          </DataRow>
        ))}
      </DataSection>

      <DataSection
        icon={<IdCard className="h-3.5 w-3.5" />}
        title={addresses.length > 1 ? 'Endereços' : 'Endereço'}
      >
        {addresses.length === 0 ? (
          <DataRow label="Endereço completo">—</DataRow>
        ) : (
          addresses.map((address) => (
            <DataRow
              key={address.id}
              // O principal é o que a qualificação usa — o rótulo diz isso em
              // vez de deixar a pessoa deduzir pela ordem.
              label={
                address.is_primary
                  ? `${ADDRESS_KIND_LABELS[address.kind]} · principal`
                  : ADDRESS_KIND_LABELS[address.kind]
              }
            >
              <CopyableValue value={formatAddressLine(address) || '—'} />
            </DataRow>
          ))
        )}
      </DataSection>

      {cliente.notes && (
        <DataSection icon={<FileText className="h-3.5 w-3.5" />} title="Observações">
          <p className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
            {cliente.notes}
          </p>
        </DataSection>
      )}
    </div>
  )
}

// ── Aba: Processos ────────────────────────────────────────────────────────────

function ProcessosTab({ clientId }: { clientId: string }) {
  const { data: processos = [], isLoading } = useLegalProcessesByClient(clientId)
  const { data: workflows = [] } = useWorkflows()

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs text-muted-foreground">
          {processos.length} processo{processos.length !== 1 ? 's' : ''}
        </span>
        <Button asChild size="sm" className="h-7 text-xs">
          <Link href={`/processos?create=1&clientId=${clientId}`}>Novo processo</Link>
        </Button>
      </div>

      {processos.length === 0 ? (
        <EmptyTab
          icon={<Scale className="h-7 w-7" />}
          message="Nenhum processo vinculado a este cliente"
          hint="Cadastre um processo e ele já aparecerá aqui."
        />
      ) : (
        processos.map((processo) => {
          const item = processo.crm_item
          const workflow = workflows.find((w) => w.id === item?.workflow_id)
          const coluna = workflow?.colunas.find((c) => c.id === item?.column_id)
          const prazoInfo = item?.next_deadline ? formatPrazo(item.next_deadline) : null

          return (
            <Link
              key={processo.id}
              href={`/processos/${processo.id}`}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getCrmItemDisplayTitle(item)}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  {coluna && (
                    <span className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: coluna.cor }}
                      />
                      {coluna.nome}
                    </span>
                  )}
                  {processo.cnj_number && (
                    <>
                      {coluna && <span>·</span>}
                      <span className="font-mono">{processo.cnj_number}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {prazoInfo && (
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      prazoInfo.tone === 'critical' && 'text-destructive',
                      prazoInfo.tone === 'warning' && 'text-warning',
                      prazoInfo.tone === 'neutral' && 'text-muted-foreground'
                    )}
                  >
                    {prazoInfo.label}
                  </span>
                )}
                {item?.assigned_profile && (
                  <div
                    title={item.assigned_profile.full_name}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9.5px] font-bold bg-accent text-accent-foreground"
                  >
                    {getInitials(item.assigned_profile.full_name)}
                  </div>
                )}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )
        })
      )}
    </div>
  )
}

// ── Aba: Casos (CRM) ──────────────────────────────────────────────────────────

/** Cards de CRM do cliente em qualquer workflow. Os que representam um processo
 * já aparecem na aba Processos, então aqui ficam só os demais — negociação,
 * atendimento, o que o escritório tiver montado. */
function CasosTab({ clientId }: { clientId: string }) {
  const { data: items = [], isLoading } = useCrmItemsByClient(clientId)
  const { data: workflows = [] } = useWorkflows()

  const casos = items.filter((item) => !item.legal_process_id)

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (casos.length === 0) {
    return (
      <EmptyTab
        icon={<Briefcase className="h-7 w-7" />}
        message="Nenhum caso sem processo"
        hint="Cards de CRM que já viraram processo aparecem na aba Processos."
      />
    )
  }

  return (
    <div className="space-y-2">
      {casos.map((item) => {
        const workflow = workflows.find((w) => w.id === item.workflow_id)
        const coluna = workflow?.colunas.find((c) => c.id === item.column_id)

        return (
          <Link
            key={item.id}
            href={`/crm?id=${item.id}`}
            className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{getCrmItemDisplayTitle(item)}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                {workflow && <span>{workflow.nome}</span>}
                {coluna && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: coluna.cor }}
                      />
                      {coluna.nome}
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="text-[10.5px] text-muted-foreground shrink-0 hidden sm:block">
              {formatRelativeDate(item.updated_at)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        )
      })}
    </div>
  )
}

// ── Aba: Pendências ───────────────────────────────────────────────────────────

/** Filtra a lista global em vez de ter query própria: assim esta aba e o módulo
 * Pendências não têm como discordar sobre o que falta num cadastro. */
function PendenciasTab({ clientId, onEdit }: { clientId: string; onEdit: () => void }) {
  const { data: pendencies = [], isLoading } = useClientesPendencies()
  const pendency = pendencies.find((p) => p.clientId === clientId)

  if (isLoading) {
    return <div className="h-16 rounded-lg bg-muted animate-pulse" />
  }

  if (!pendency) {
    return (
      <EmptyTab
        icon={<Check className="h-7 w-7 text-success" />}
        message="Cadastro completo"
        hint="Nenhum campo essencial em falta."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
        <AlertTriangle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {pendency.issues.length} campo
            {pendency.issues.length !== 1 ? 's' : ''} em falta
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {pendency.issues.map((issue) => (
              <li
                key={issue.kind}
                className={cn(
                  'text-xs',
                  // O que trava o trabalho fica em vermelho aqui também, para
                  // a aba concordar com a tela de pendências.
                  issue.severity === 'high'
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground'
                )}
              >
                · {issue.label}
              </li>
            ))}
          </ul>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" />
          Completar
        </Button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ClienteDetailPage({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const { data: cliente, isLoading, error } = useCliente(clienteId)

  const [tab, setTab] = useState<Tab>('cadastro')
  const [editOpen, setEditOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)

  const updateCliente = useUpdateCliente(clienteId)
  const createTask = useCreateTask()

  // Mesmas queries que alimentam as abas — os contadores dos cartões não podem
  // divergir do que a aba mostra ao ser aberta.
  const { data: tarefas = [] } = useTasksForEntity({ clientId: clienteId })
  const { data: notas = [] } = useClientComments(clienteId)

  async function handleEditSubmit(data: CreateClientInput) {
    await updateCliente.mutateAsync(data)
    setEditOpen(false)
  }

  async function handleCreateTask(data: CreateTaskInput) {
    await createTask.mutateAsync({ ...data, client_id: clienteId })
    setTaskOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Cliente não encontrado</p>
        <Button variant="outline" onClick={() => router.push('/clientes')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    )
  }

  const name = getClientDisplayName(cliente)
  const document = getClientDocument(cliente)
  const age = getClientAge(cliente.birth_date)
  const areas = cliente.legal_areas ?? []
  const tags = (cliente.tags ?? []) as CrmTag[]
  const tarefasPendentes = tarefas.filter((t) => t.status !== 'done').length

  return (
    <div className="flex flex-col h-full -m-6">
      {/* ── Breadcrumb ── */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Trilha">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            Início
          </Link>
          <span className="text-border">/</span>
          <Link href="/clientes" className="hover:text-foreground transition-colors">
            Clientes
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium truncate">{name}</span>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* ── Cabeçalho ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
                  {getInitials(name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight truncate">{name}</h1>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(name)
                        toast.success('Nome copiado')
                      }}
                      title="Copiar nome"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      {cliente.type === 'company' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </span>
                    <LegalAreaBadges areas={areas} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  Cadastrado em {formatDate(cliente.created_at)}
                </span>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar cadastro
                </Button>
              </div>
            </div>

            {/* ── Faixa de informações ── */}
            <div className="flex border-t border-border">
              <InfoStripItem
                icon={<IdCard className="h-3 w-3" />}
                label={cliente.type === 'company' ? 'CNPJ' : 'CPF'}
              >
                {document ? (
                  <p className="text-sm font-semibold text-foreground truncate">
                    <CopyableValue value={formatDocument(document)} mono />
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-muted-foreground">—</p>
                )}
              </InfoStripItem>
              <InfoStripItem
                icon={<Phone className="h-3 w-3" />}
                label="Telefone"
                value={cliente.phone}
              />
              <InfoStripItem
                icon={<Calendar className="h-3 w-3" />}
                label={cliente.type === 'company' ? 'Cliente desde' : 'Nascimento'}
                value={
                  cliente.type === 'company'
                    ? formatDate(cliente.created_at)
                    : cliente.birth_date
                      ? `${formatDate(cliente.birth_date)}${age != null ? ` (${age} anos)` : ''}`
                      : null
                }
              />
              <InfoStripItem
                icon={<UserCog className="h-3 w-3" />}
                label="Responsável"
                value={cliente.assignee?.full_name}
              />
            </div>

            {/* ── Etiquetas ── */}
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {tags.length === 0 ? (
                <span className="text-sm text-muted-foreground">Sem etiquetas</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const et = tagAppearance(tag)
                    return (
                      <span
                        key={tag}
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          et.color,
                          et.textColor
                        )}
                      >
                        {et.label}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Cards de ação ── */}
          <div className="flex gap-4">
            <ActionCard
              icon={<Check className="h-4 w-4 text-muted-foreground" />}
              label="Atividades"
              count={tarefasPendentes}
              actionLabel="Nova atividade"
              onAction={() => setTaskOpen(true)}
              onOpen={() => setTab('atividades')}
            />
            <ActionCard
              icon={<MessageCircle className="h-4 w-4 text-muted-foreground" />}
              label="Notas"
              count={notas.length}
              actionLabel="Nova nota"
              onAction={() => setTab('atividades')}
              onOpen={() => setTab('atividades')}
            />
          </div>

          {/* ── Abas ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex gap-0 overflow-x-auto border-b border-border px-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-all',
                    tab === t.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === 'cadastro' && <CadastroTab cliente={cliente} />}
              {tab === 'atividades' && (
                <div className="space-y-8">
                  <EntityTasksTab
                    clientId={clienteId}
                    lockedClientId={clienteId}
                    itemLabel="cliente"
                  />
                  <div className="border-t border-border pt-6">
                    <ClientComments clientId={clienteId} entityTitle={name} />
                  </div>
                </div>
              )}
              {tab === 'agenda' && (
                <EntityEventsTab
                  clientId={clienteId}
                  lockedClientId={clienteId}
                  itemLabel="cliente"
                />
              )}
              {tab === 'processos' && <ProcessosTab clientId={clienteId} />}
              {tab === 'casos' && <CasosTab clientId={clienteId} />}
              {tab === 'financeiro' && (
                <FinancialEntriesTab
                  clientId={clienteId}
                  lockedClientId={clienteId}
                  itemLabel="cliente"
                />
              )}
              {tab === 'arquivos' && (
                <DocumentsTab clientId={clienteId} lockedClientId={clienteId} itemLabel="cliente" />
              )}
              {tab === 'pendencias' && (
                <PendenciasTab clientId={clienteId} onEdit={() => setEditOpen(true)} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Diálogos ── */}
      <ClienteForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        isLoading={updateCliente.isPending}
        defaultValues={cliente}
      />

      <Dialog open={taskOpen} onOpenChange={(open) => !open && setTaskOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova Atividade</DialogTitle>
          </DialogHeader>
          <TaskForm onSubmit={handleCreateTask} isLoading={createTask.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
