'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Gavel,
  Landmark,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Scale,
  Search,
  Send,
  Tag,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { InfoStripItem, ActionCard } from '@/components/shared/DetailStrip'
import { formatDocument } from '@/utils/format'
import { useLegalProcess } from '../hooks/useLegalProcesses'
import {
  useUpdateLegalProcess,
  useMarkMovement,
  useLinkPartyToClient,
} from '../hooks/useLegalProcessMutations'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { ETIQUETAS } from '@/data/mock'
import type { CrmTag } from '@/schemas/crmItem.schema'
import {
  PROCESS_TYPE_LABELS,
  PROCESS_STATUS_LABELS,
  groupPartiesByPolo,
  type DisplayParty,
  type PartyClient,
  type LegalProcessMovement,
  type LegalProcessWithRelations,
} from '@/types/legalProcess.types'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { ProcessoForm } from './ProcessoForm'
import { CrmItemTimeline } from '@/features/crm/components/CrmItemTimeline'
import { CrmItemComments } from '@/features/crm/components/CrmItemComments'
import { CrmItemClienteTab } from '@/features/crm/components/CrmItemClienteTab'
import { EntityEventsTab } from '@/features/agenda/components/EntityEventsTab'
import { EntityTasksTab } from '@/features/tarefas/components/EntityTasksTab'
import { DocumentsTab } from '@/features/documentos/components/DocumentsTab'
import { FinancialEntriesTab } from '@/features/financeiro/components/FinancialEntriesTab'
import { useTasksForEntity } from '@/features/tarefas/hooks/useTasks'
import { useCreateTask } from '@/features/tarefas/hooks/useTaskMutations'
import { TaskForm } from '@/features/tarefas/components/TaskForm'
import { useCrmItemComments, useAddCrmItemComment } from '@/features/crm/hooks/useCrmItemComments'
import { ClienteForm } from '@/features/clientes/components/ClienteForm'
import { useCreateCliente } from '@/features/clientes/hooks/useClienteMutations'
import type { ClientWithRelations } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import { useDocumentsForEntity } from '@/features/documentos/hooks/useDocuments'
import { useOpenDocument } from '@/features/documentos/hooks/useDocumentMutations'
import { formatFileSize, getFileExtension } from '@/types/document.types'

const PAGE_SIZE = 20

/** As três primeiras filtram a timeline; as demais trocam o painel inteiro.
 * Vivem no mesmo grupo porque, para quem usa, são todas "o que tem neste
 * processo" — separá-las em duas barras obrigava a procurar em dois lugares. */
type TimelineFilter = 'tudo' | 'publicacoes' | 'movimentacoes'
type EntityTab = 'agenda' | 'tarefas' | 'documentos' | 'financeiro' | 'comentarios' | 'cliente' | 'etapas'
type Tab = TimelineFilter | EntityTab

const TIMELINE_TABS: readonly TimelineFilter[] = ['tudo', 'publicacoes', 'movimentacoes']

function isTimelineTab(tab: Tab): tab is TimelineFilter {
  return (TIMELINE_TABS as readonly string[]).includes(tab)
}

const ENTITY_TABS: { id: EntityTab; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comentarios', label: 'Comentários' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'etapas', label: 'Etapas' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateOnly(value: string | null): string {
  if (!value) return '—'
  return format(parseISO(value), 'dd/MM/yyyy', { locale: ptBR })
}

/** Nome de exibição do cliente vinculado a uma parte. Mesma regra do
 * getClientDisplayName, mas sobre o recorte mínimo que a parte embeda. */
function partyClientName(client: PartyClient): string {
  if (client.type === 'individual') return client.name ?? ''
  return client.trade_name ?? client.company_name ?? ''
}

/** Semente para o cadastro de cliente feito a partir de uma parte.
 *
 * 14 dígitos é CNPJ, e aí o nome que veio do tribunal é razão social. Sem
 * documento, assume pessoa física — o caso mais comum e o mais fácil de
 * corrigir no próprio formulário. */
function partyAsClientDefaults(party: DisplayParty): Partial<ClientWithRelations> {
  const digits = party.document?.replace(/\D/g, '') ?? ''
  // Já mascarado: o campo do cadastro exibe o que recebe, e um documento sem
  // pontuação passaria a impressão de que veio errado.
  const document = digits ? formatDocument(digits) : undefined

  if (digits.length === 14) {
    return {
      type: 'company',
      company_name: party.name,
      cnpj: document,
    } as Partial<ClientWithRelations>
  }
  return {
    type: 'individual',
    name: party.name,
    cpf: document,
  } as Partial<ClientWithRelations>
}

/** Título do movimento: `title` quando a origem separou, senão a primeira
 * linha da descrição. */
function movementTitle(movement: LegalProcessMovement): string {
  if (movement.title) return movement.title
  const [firstLine] = movement.description.split('\n')
  return firstLine
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

/** Cartão que aparece ao passar o mouse sobre uma parte.
 *
 * O ponto dele é a distinção que o nome sozinho não conta: a parte veio do
 * tribunal como texto e pode não corresponder a nenhum cliente cadastrado. */
function PartyCard({
  party,
  onLink,
  onEditParties,
}: {
  party: DisplayParty
  onLink: () => void
  onEditParties: () => void
}) {
  return (
    <div className="w-[280px] space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Cliente / Contato
      </p>

      {party.document && (
        <p className="text-sm font-mono text-foreground">{formatDocument(party.document)}</p>
      )}
      {party.party_type && <p className="text-xs text-muted-foreground">{party.party_type}</p>}

      {party.client ? (
        <>
          <p className="text-sm text-foreground">{partyClientName(party.client)}</p>
          <Link
            href={`/clientes/${party.client.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            Ver cadastro
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Esta parte ainda não está vinculada a um cliente ou contato cadastrado.
          </p>
          {party.id ? (
            <Button size="sm" className="w-full" onClick={onLink}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Vincular ou cadastrar
            </Button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Esta parte vem do cadastro antigo do processo e ainda não tem registro próprio.
              </p>
              <Button size="sm" variant="outline" className="w-full" onClick={onEditParties}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Cadastrar partes
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}

function PoloBlock({
  label,
  tone,
  parties,
  onLinkParty,
  onEditParties,
}: {
  label: string
  tone: 'ativo' | 'passivo'
  parties: DisplayParty[]
  onLinkParty: (party: DisplayParty) => void
  onEditParties: () => void
}) {
  return (
    <div className="flex-1 min-w-0 p-4">
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium mb-3',
          tone === 'ativo'
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        )}
      >
        {label}
      </span>

      {parties.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma parte cadastrada</p>
      ) : (
        <div className="space-y-1">
          {parties.map((party) => (
            <HoverCard key={party.id ?? `legacy-${party.name}`} openDelay={150} closeDelay={100}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-left text-sm text-foreground hover:text-accent-foreground transition-colors"
                >
                  <span className="truncate">{party.name}</span>
                  {!party.client && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                      title="Parte sem cliente vinculado"
                    />
                  )}
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-auto">
                <PartyCard
                  party={party}
                  onLink={() => onLinkParty(party)}
                  onEditParties={onEditParties}
                />
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      )}
    </div>
  )
}

function MovementDocumentCard({
  doc,
  onOpen,
}: {
  doc: { id: string; file_name: string; file_size: number; created_at: string; file_path: string }
  onOpen: (path: string) => void
}) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
        {getFileExtension(doc.file_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{doc.file_name}</p>
        <p className="text-[11px] text-muted-foreground">
          {format(parseISO(doc.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })} ·{' '}
          {formatFileSize(doc.file_size)}
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(doc.file_path)}>
        <ExternalLink className="w-3 h-3 mr-1" />
        Abrir
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(doc.file_path)}>
        <Download className="w-3 h-3 mr-1" />
        Baixar
      </Button>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProcessoDetailPage({ processoId }: { processoId: string }) {
  const router = useRouter()
  const { data: processo, isLoading, error } = useLegalProcess(processoId)

  const [tab, setTab] = useState<Tab>('tudo')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  /** Parte cujo vínculo com cliente está sendo editado. */
  const [linkingParty, setLinkingParty] = useState<DisplayParty | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  /** Publicação que originou a tarefa, quando houver — ela é dada por tratada
   * ao salvar. Null quando a tarefa nasce do botão "Nova atividade". */
  const [taskSource, setTaskSource] = useState<LegalProcessMovement | null>(null)

  function openTaskDialog(source: LegalProcessMovement | null) {
    setTaskSource(source)
    setTaskOpen(true)
  }

  const item = processo?.crm_item ?? null
  const clientName = getCrmItemClientName(item)
  const crmItemIds = useMemo(() => processo?.crm_items.map((c) => c.id) ?? [], [processo])

  const updateProcess = useUpdateLegalProcess(processoId, item?.id ?? '')
  const markMovement = useMarkMovement()
  const createTask = useCreateTask()
  const openDocument = useOpenDocument()
  const linkParty = useLinkPartyToClient()
  const createCliente = useCreateCliente()
  // `item` pode ser null num processo órfão; o botão de nota fica desabilitado
  // nesse caso, então a mutação nunca dispara com id vazio.
  const addComment = useAddCrmItemComment(item?.id ?? '', clientName)

  // Mesmas queries que alimentam as abas — os contadores não podem divergir do
  // que a aba mostra ao ser aberta.
  const { data: tarefas = [] } = useTasksForEntity({ legalProcessId: processoId, crmItemIds })
  const { data: comentarios = [] } = useCrmItemComments(crmItemIds)
  const { data: documentos = [] } = useDocumentsForEntity({
    legalProcessId: processoId,
    crmItemIds,
  })

  /** Documentos indexados por movimentação, para o card dentro do item. */
  const docsByMovement = useMemo(() => {
    const map = new Map<string, (typeof documentos)[number][]>()
    for (const doc of documentos) {
      const movementId = (doc as { movement_id?: string | null }).movement_id
      if (!movementId) continue
      const list = map.get(movementId)
      if (list) list.push(doc)
      else map.set(movementId, [doc])
    }
    return map
  }, [documentos])

  // `[...]` antes de ordenar: `processo.movements` é o array do cache do React
  // Query, e `.sort()` muta in-place.
  const sortedMovements = useMemo(
    () =>
      [...(processo?.movements ?? [])].sort(
        (a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
      ),
    [processo]
  )

  const publicacoes = sortedMovements.filter((m) => m.kind === 'publicacao')
  const movimentacoes = sortedMovements.filter((m) => m.kind === 'movimentacao')

  // Abas de entidade não mostram a timeline; 'tudo' só evita um ramo morto no memo.
  const timelineFilter: TimelineFilter = isTimelineTab(tab) ? tab : 'tudo'

  const filtered = useMemo(() => {
    const base =
      timelineFilter === 'publicacoes'
        ? publicacoes
        : timelineFilter === 'movimentacoes'
          ? movimentacoes
          : sortedMovements

    const q = search.trim().toLowerCase()
    if (!q) return base

    return base.filter((m) =>
      [m.title, m.description, m.author, m.event_number?.toString()]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [timelineFilter, search, sortedMovements, publicacoes, movimentacoes])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function resetPaging<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(0)
    }
  }

  async function handleEditSubmit(data: LegalProcessInput) {
    await updateProcess.mutateAsync(data)
    setEditOpen(false)
  }

  async function handleCreateTask(data: CreateTaskInput) {
    await createTask.mutateAsync({ ...data, legal_process_id: processoId })
    // Criar a tarefa a partir de uma publicação também a dá por tratada — foi
    // exatamente para isso que ela virou tarefa.
    if (taskSource) {
      markMovement.mutate({ movementId: taskSource.id, handled: true })
    }
    setTaskOpen(false)
    setTaskSource(null)
  }

  function handleCreateNote() {
    const content = noteDraft.trim()
    if (!content || addComment.isPending) return
    addComment.mutate(content, {
      onSuccess: () => {
        setNoteDraft('')
        setNoteOpen(false)
        toast.success('Nota registrada.')
      },
    })
  }

  async function handleCreateClientForParty(data: CreateClientInput) {
    if (!linkingParty?.id) return
    const created = await createCliente.mutateAsync(data)
    // O vínculo é o motivo do cadastro; se falhar aqui, o cliente existe mas a
    // parte segue solta — o popover continuará oferecendo o botão.
    await linkParty.mutateAsync({ partyId: linkingParty.id, clientId: created.id })
    setLinkingParty(null)
  }

  function copyCnj() {
    if (!processo?.cnj_number) return
    navigator.clipboard.writeText(processo.cnj_number)
    toast.success('Número CNJ copiado')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !processo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Processo não encontrado</p>
        <Button variant="outline" onClick={() => router.push('/processos')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    )
  }

  const partiesByPolo = groupPartiesByPolo(processo)
  const tags = (item?.tags ?? []) as CrmTag[]
  const tarefasPendentes = tarefas.filter((t) => t.status !== 'done').length
  const naoLidas = publicacoes.filter((p) => !p.read_at).length

  const timelineTabs: { id: TimelineFilter; label: string; count: number }[] = [
    // "Tudo" é o total real, não a soma das outras duas — publicações e
    // movimentações já são partições do mesmo conjunto.
    { id: 'tudo', label: 'Tudo', count: sortedMovements.length },
    { id: 'publicacoes', label: 'Publicações', count: publicacoes.length },
    { id: 'movimentacoes', label: 'Movimentações', count: movimentacoes.length },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* ── Breadcrumb ── */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Trilha">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            Início
          </Link>
          <span className="text-border">/</span>
          <Link href="/processos" className="hover:text-foreground transition-colors">
            Processos
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium truncate">
            {processo.cnj_number ?? clientName}
          </span>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* ── Cabeçalho ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Gavel className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight truncate">
                      {processo.cnj_number ?? 'Sem número CNJ'}
                    </h1>
                    {processo.cnj_number && (
                      <button
                        type="button"
                        onClick={copyCnj}
                        title="Copiar número"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="truncate">
                      {[processo.procedural_class, processo.subject].filter(Boolean).join(' / ') ||
                        'Classe e assunto não informados'}
                    </span>
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  Cadastrado {formatDateOnly(processo.created_at.slice(0, 10))}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    processo.status === 'ativo'
                      ? 'bg-success/12 text-success'
                      : processo.status === 'suspenso'
                        ? 'bg-warning/12 text-warning'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {PROCESS_STATUS_LABELS[processo.status]}
                </span>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              </div>
            </div>

            {/* ── Faixa de informações ── */}
            <div className="flex border-t border-border">
              <InfoStripItem
                icon={<Scale className="h-3 w-3" />}
                label="Tipo"
                value={PROCESS_TYPE_LABELS[processo.process_type]}
              />
              <InfoStripItem
                icon={<Wallet className="h-3 w-3" />}
                label="Valor da causa"
                value={processo.case_value != null ? formatCurrency(processo.case_value) : null}
                valueClassName={processo.case_value != null ? 'text-success' : undefined}
              />
              <InfoStripItem
                icon={<Calendar className="h-3 w-3" />}
                label="Ajuizamento"
                value={processo.filing_date ? formatDateOnly(processo.filing_date) : null}
              />
              <InfoStripItem
                icon={<MapPin className="h-3 w-3" />}
                label="Comarca"
                value={processo.comarca}
              />
              <InfoStripItem
                icon={<Gavel className="h-3 w-3" />}
                label="Juízo"
                value={processo.court_division}
              />
              <InfoStripItem
                icon={<Landmark className="h-3 w-3" />}
                label="Tribunal"
                value={processo.court}
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
                    const et = ETIQUETAS[tag]
                    return (
                      <span
                        key={tag}
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          et?.color,
                          et?.textColor
                        )}
                      >
                        {et?.label ?? tag}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Polos ── */}
            <div className="flex border-t border-border divide-x divide-border">
              <PoloBlock
                label="Pólo Ativo"
                tone="ativo"
                parties={partiesByPolo.ativo}
                onLinkParty={setLinkingParty}
                onEditParties={() => setEditOpen(true)}
              />
              <PoloBlock
                label="Pólo Passivo"
                tone="passivo"
                parties={partiesByPolo.passivo}
                onLinkParty={setLinkingParty}
                onEditParties={() => setEditOpen(true)}
              />
            </div>
          </div>

          {/* ── Cards de ação ── */}
          <div className="flex gap-4">
            <ActionCard
              icon={<Check className="h-4 w-4 text-muted-foreground" />}
              label="Atividades"
              count={tarefasPendentes}
              actionLabel="Nova atividade"
              onAction={() => openTaskDialog(null)}
              onOpen={() => setTab('tarefas')}
            />
            <ActionCard
              icon={<FileText className="h-4 w-4 text-muted-foreground" />}
              label="Notas"
              count={comentarios.length}
              actionLabel="Nova nota"
              onAction={() => setNoteOpen(true)}
              onOpen={() => setTab('comentarios')}
            />
          </div>

          {/* ── Abas ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
              <div className="flex gap-0 overflow-x-auto">
                {timelineTabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => resetPaging(setTab)(t.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-all',
                      tab === t.id
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground/80'
                    )}
                  >
                    {t.label}
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      {t.count}
                    </span>
                    {t.id === 'publicacoes' && naoLidas > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" title={`${naoLidas} não lida(s)`} />
                    )}
                  </button>
                ))}

                {/* Separador entre o que é a timeline e o que é entidade
                    vinculada — mesma barra, leituras diferentes. */}
                <span className="mx-2 my-2 w-px shrink-0 bg-border" aria-hidden />

                {ENTITY_TABS.map((t) => (
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

              {isTimelineTab(tab) && (
                <div className="relative w-[260px] shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => resetPaging(setSearch)(e.target.value)}
                    placeholder="Buscar no processo..."
                    className="h-8 pl-8 text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => resetPaging(setSearch)('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {isTimelineTab(tab) && (
              <>
            {/* Contagem + paginação */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <p className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? 'item encontrado' : 'itens encontrados'}
                {filtered.length > 0 && (
                  <>
                    {' · '}
                    Mostrando de {safePage * PAGE_SIZE + 1} a{' '}
                    {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
                  </>
                )}
              </p>

              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="p-1 rounded border border-border text-muted-foreground disabled:opacity-40 hover:bg-muted transition-colors"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      className={cn(
                        'h-6 w-6 rounded text-xs font-medium transition-colors',
                        i === safePage
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="p-1 rounded border border-border text-muted-foreground disabled:opacity-40 hover:bg-muted transition-colors"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Lista */}
            {pageItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Scale className="h-7 w-7" />
                <p className="text-sm">
                  {search.trim() ? 'Nenhum item para essa busca' : 'Nenhuma movimentação registrada'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pageItems.map((movement) => {
                  const isPublicacao = movement.kind === 'publicacao'
                  const unread = isPublicacao && !movement.read_at
                  const docs = docsByMovement.get(movement.id) ?? []

                  return (
                    <div
                      key={movement.id}
                      className={cn(
                        'flex gap-4 p-4 border-l-2',
                        unread ? 'border-l-warning bg-warning/[0.04]' : 'border-l-transparent'
                      )}
                    >
                      <div className="flex w-[92px] shrink-0 flex-col">
                        <p className="text-xs font-medium">
                          {format(parseISO(movement.movement_date), 'dd/MM/yyyy')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(parseISO(movement.movement_date), 'HH:mm')}h
                        </p>
                        <span
                          className={cn(
                            'mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide',
                            isPublicacao ? 'text-warning' : 'text-muted-foreground'
                          )}
                        >
                          {isPublicacao ? (
                            <FileText className="h-2.5 w-2.5" />
                          ) : (
                            <Scale className="h-2.5 w-2.5" />
                          )}
                          {isPublicacao ? 'Publicação' : 'Movimentação'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {unread && (
                            <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/12 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                              Não lida
                            </span>
                          )}
                          {movement.handled_at && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                              <Check className="h-2.5 w-2.5" />
                              Tratada
                            </span>
                          )}
                          {movement.event_number != null && (
                            <span className="text-[11px] text-muted-foreground">
                              #{movement.event_number}
                            </span>
                          )}
                        </div>

                        <p className={cn('text-sm mt-1 leading-relaxed', unread && 'font-medium')}>
                          {movementTitle(movement)}
                        </p>

                        {movement.title && movement.description !== movement.title && (
                          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                            {movement.description}
                          </p>
                        )}

                        {movement.author && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Gavel className="h-3 w-3" />
                            Magistrado(a) · {movement.author}
                          </p>
                        )}

                        {docs.map((doc) => (
                          <MovementDocumentCard
                            key={doc.id}
                            doc={doc}
                            onOpen={(path) => openDocument.mutate(path)}
                          />
                        ))}

                        {isPublicacao && (
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            {!movement.handled_at && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  markMovement.mutate({ movementId: movement.id, handled: true })
                                }
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Marcar tratada
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => openTaskDialog(movement)}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Criar atividade
                            </Button>
                            {unread && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() =>
                                  markMovement.mutate({ movementId: movement.id, read: true })
                                }
                              >
                                Marcar lida
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
              </>
            )}

            {!isTimelineTab(tab) && (
            <div className="p-5">
              {tab === 'agenda' && (
                <EntityEventsTab
                  legalProcessId={processo.id}
                  crmItemIds={crmItemIds}
                  lockedLegalProcessId={processo.id}
                  lockedClientId={item?.client_id}
                  itemLabel="processo"
                />
              )}
              {tab === 'tarefas' && (
                <EntityTasksTab
                  legalProcessId={processo.id}
                  crmItemIds={crmItemIds}
                  lockedLegalProcessId={processo.id}
                  lockedClientId={item?.client_id}
                  itemLabel="processo"
                />
              )}
              {tab === 'documentos' && (
                <DocumentsTab
                  legalProcessId={processo.id}
                  crmItemIds={crmItemIds}
                  lockedLegalProcessId={processo.id}
                  itemLabel="processo"
                />
              )}
              {tab === 'financeiro' && (
                <FinancialEntriesTab
                  legalProcessId={processo.id}
                  crmItemIds={crmItemIds}
                  lockedLegalProcessId={processo.id}
                  lockedClientId={item?.client_id}
                  itemLabel="processo"
                />
              )}
              {tab === 'comentarios' &&
                (item ? (
                  <CrmItemComments
                    crmItemId={item.id}
                    readCrmItemIds={crmItemIds}
                    entityTitle={clientName}
                    itemLabel="processo"
                  />
                ) : (
                  <OrphanNotice />
                ))}
              {tab === 'cliente' &&
                (item ? (
                  <CrmItemClienteTab
                    client={item.client}
                    onLinkClient={(clientId) => updateProcess.mutate({ client_id: clientId })}
                    isLinking={updateProcess.isPending}
                  />
                ) : (
                  <OrphanNotice />
                ))}
              {tab === 'etapas' &&
                (item ? (
                  <CrmItemTimeline crmItemId={item.id} itemLabel="processo" />
                ) : (
                  <OrphanNotice />
                ))}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Diálogos ── */}
      {item && (
        <ProcessoForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editingProcess={processo as LegalProcessWithRelations}
          onSubmit={handleEditSubmit}
          isLoading={updateProcess.isPending}
        />
      )}

      <Dialog
        open={noteOpen}
        onOpenChange={(open) => {
          if (!open) setNoteOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova Nota</DialogTitle>
          </DialogHeader>
          {item ? (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Mesmo contrato da aba Comentários: Enter envia.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateNote()
                  }
                }}
                rows={5}
                placeholder="Registre uma tratativa, decisão ou observação sobre o processo..."
                className={cn(
                  'w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground bg-card resize-none',
                  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors'
                )}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Enter envia · Shift+Enter quebra linha
                </span>
                <Button
                  size="sm"
                  onClick={handleCreateNote}
                  disabled={!noteDraft.trim() || addComment.isPending}
                >
                  {addComment.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Registrar nota
                </Button>
              </div>
            </div>
          ) : (
            <OrphanNotice />
          )}
        </DialogContent>
      </Dialog>

      {/* Cadastro direto: a parte já traz nome e documento, então não há o que
          procurar — o popover só oferece o botão quando não existe vínculo. */}
      {linkingParty && (
        <ClienteForm
          open
          onClose={() => setLinkingParty(null)}
          onSubmit={handleCreateClientForParty}
          isLoading={createCliente.isPending || linkParty.isPending}
          defaultValues={partyAsClientDefaults(linkingParty)}
        />
      )}

      <Dialog
        open={taskOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTaskOpen(false)
            setTaskSource(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova Atividade</DialogTitle>
          </DialogHeader>
          <TaskForm
            defaultValues={
              taskSource ? { title: movementTitle(taskSource).slice(0, 200) } : undefined
            }
            onSubmit={handleCreateTask}
            isLoading={createTask.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Processo sem crm_item vinculado — as abas que dependem dele não têm onde
 * escrever. Anomalia que a guarda de exclusão previne, mas que dados antigos
 * podem conter. */
function OrphanNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
      <FileText className="w-4 h-4 shrink-0 text-warning mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Processo sem caso vinculado</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Esta aba depende do caso no CRM, que foi removido. Os dados processuais seguem
          disponíveis acima.
        </p>
      </div>
    </div>
  )
}
