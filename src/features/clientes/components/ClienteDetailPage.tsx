'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Ellipsis,
  FileSignature,
  Loader2,
  MessageCircle,
  Pencil,
  Scale,
  Search,
  UserMinus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ActionCard } from '@/components/shared/DetailStrip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PortalLinkButton } from './PortalLinkDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { getClientDisplayName, getClientDocument } from '@/types/cliente.types'
import { getCrmItemDisplayTitle } from '@/types/crmItem.types'
import { getInitials } from '@/utils/profile'
import { useCliente, useClientComments, useClientesPendencies } from '../hooks/useClientes'
import { useUpdateCliente } from '../hooks/useClienteMutations'
import { ClienteForm } from './ClienteForm'
import { CadastroHeader } from './CadastroHeader'
import { CadastroTab } from './CadastroTab'
import { MoveToPeopleDialog } from './MoveToPeopleDialog'
import { IssueList, PendencyHeaderBadge, faltamLabel } from './PendencyBadge'
import { ClientComments } from './ClientComments'
import { Can } from '@/components/shared/Can'
import { BuscaPorDocumentoDialog } from '@/features/processos/components/BuscaPorDocumentoDialog'
import { useLegalProcessesByClient } from '@/features/processos/hooks/useLegalProcesses'
import { useCrmItemsByClient } from '@/features/crm/hooks/useCrmItems'
import { useWorkflows } from '@/features/crm/hooks/useWorkflows'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { EntityEventsTab } from '@/features/agenda/components/EntityEventsTab'
import { EntityTasksTab } from '@/features/tarefas/components/EntityTasksTab'
import { DocumentsTab } from '@/features/documentos/components/DocumentsTab'
import { EntityContractsTab } from '@/features/contratos/components/EntityContractsTab'
import { usePermissions } from '@/hooks/usePermissions'
import { GenerateDocumentDialog } from '@/features/documentos/components/GenerateDocumentDialog'
import { FinancialEntriesTab } from '@/features/financeiro/components/FinancialEntriesTab'
import { useTasksForEntity } from '@/features/tarefas/hooks/useTasks'
import { useCreateTask } from '@/features/tarefas/hooks/useTaskMutations'
import { TaskForm } from '@/features/tarefas/components/TaskForm'
import { useAssistantScreen } from '@/features/ia/hooks/useAssistantScreen'

type Tab =
  | 'cadastro'
  | 'atividades'
  | 'agenda'
  | 'processos'
  | 'casos'
  | 'contratos'
  | 'financeiro'
  | 'arquivos'
  | 'pendencias'

const TABS: { id: Tab; label: string }[] = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'atividades', label: 'Atividades e Notas' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'processos', label: 'Processos' },
  { id: 'casos', label: 'Casos' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'pendencias', label: 'Pendências' },
]

// ── Sub-componentes ───────────────────────────────────────────────────────────

function EmptyTab({ icon, message, hint }: { icon: React.ReactNode; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      {icon}
      <p className="text-sm font-medium">{message}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  )
}

// ── Aba: Processos ────────────────────────────────────────────────────────────

function ProcessosTab({
  clientId,
  clientName,
  clientDocument,
}: {
  clientId: string
  clientName: string
  clientDocument: string
}) {
  const { data: processos = [], isLoading } = useLegalProcessesByClient(clientId)
  const { data: workflows = [] } = useWorkflows()
  const [buscaOpen, setBuscaOpen] = useState(false)

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
        <div className="flex gap-2">
          {/* Só quem pode criar processo vê a busca: ela gasta crédito pago e
              existe para terminar em importação. */}
          <Can resource="processos" action="create">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setBuscaOpen(true)}
              disabled={!clientDocument}
              title={
                clientDocument
                  ? undefined
                  : 'Cadastre o CPF ou CNPJ do cliente para poder consultar'
              }
            >
              <Search className="h-3.5 w-3.5" /> Buscar por CPF/CNPJ
            </Button>
          </Can>
          <Button asChild size="sm" className="h-7 text-xs">
            <Link href={`/processos?create=1&clientId=${clientId}`}>Novo processo</Link>
          </Button>
        </div>
      </div>

      <BuscaPorDocumentoDialog
        open={buscaOpen}
        onOpenChange={setBuscaOpen}
        clientId={clientId}
        clientName={clientName}
        document={clientDocument}
      />

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
            {faltamLabel(pendency.issues.length)}
          </p>
          <div className="mt-1.5">
            <IssueList issues={pendency.issues} />
          </div>
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
  const { can } = usePermissions()

  useAssistantScreen(
    cliente
      ? { entities: [{ kind: 'cliente', id: cliente.id, label: getClientDisplayName(cliente) }] }
      : null,
  )

  const [tab, setTab] = useState<Tab>('cadastro')
  const [editOpen, setEditOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const updateCliente = useUpdateCliente(clienteId)
  const createTask = useCreateTask()

  // Mesmas queries que alimentam as abas — os contadores dos cartões não podem
  // divergir do que a aba mostra ao ser aberta.
  const { data: tarefas = [] } = useTasksForEntity({ clientId: clienteId })
  const { data: notas = [] } = useClientComments(clienteId)

  // Mesma query da aba de Pendências — o React Query serve as duas do mesmo
  // cache, então o aviso do cabeçalho não tem como discordar do que a aba
  // mostra ao ser aberta.
  const { data: pendencies = [] } = useClientesPendencies()
  const pendency = pendencies.find((p) => p.clientId === clienteId)

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
          <CadastroHeader
            cliente={cliente}
            badge={
              pendency && (
                <PendencyHeaderBadge pendency={pendency} onOpen={() => setTab('pendencias')} />
              )
            }
            actions={
              <>
                <PortalLinkButton clientId={clienteId} />
                <Can resource="documentos" action="view">
                  <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}>
                    <FileSignature className="h-3.5 w-3.5 mr-1.5" />
                    Gerar documento
                  </Button>
                </Can>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar cadastro
                </Button>
                {/* Num menu, e não como botão: é ação de limpeza, rara, e não
                    pode competir com as do dia a dia. */}
                <Can resource="clientes" action="update">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Mais ações do cadastro">
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
                        <UserMinus className="h-3.5 w-3.5" />
                        Mover para Pessoas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
              </>
            }
          />

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
              {TABS.filter((t) => t.id !== 'contratos' || can('contratos', 'view')).map((t) => (
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
                  <span className="inline-flex items-center gap-1.5">
                    {t.label}
                    {/* Bolinha só na aba de Pendências: é a única cujo conteúdo
                        muda sem ninguém ter feito nada no cadastro. */}
                    {t.id === 'pendencias' && pendency && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                      />
                    )}
                  </span>
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
              {tab === 'processos' && (
                <ProcessosTab
                  clientId={clienteId}
                  clientName={getClientDisplayName(cliente)}
                  clientDocument={getClientDocument(cliente)}
                />
              )}
              {tab === 'casos' && <CasosTab clientId={clienteId} />}
              {tab === 'contratos' && (
                <EntityContractsTab clientId={clienteId} itemLabel="cliente" />
              )}
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

      <GenerateDocumentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        clientId={clienteId}
      />

      {/* Movido, a ficha de cliente não vale mais para o registro: vai para a
          de pessoa. */}
      <MoveToPeopleDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        clientId={clienteId}
        clientName={name}
        onMoved={() => router.push(`/pessoas/${clienteId}`)}
      />
    </div>
  )
}
