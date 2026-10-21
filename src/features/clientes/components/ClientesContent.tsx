'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  ArrowRight,
  Pencil,
  Trash2,
  AlertCircle,
  AlertTriangle,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ClienteForm } from './ClienteForm'
import { LegalAreaBadges } from './LegalAreaBadges'
import { ConvertToClientDialog } from './ConvertToClientDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import { formatRelative } from '@/utils/date'
import {
  useCadastroList,
  useClientesPendencies,
  type CadastroListScope,
} from '../hooks/useClientes'
import {
  useCreateCliente,
  useCreatePessoa,
  useUpdateCliente,
  useDeleteCliente,
} from '../hooks/useClienteMutations'
import type { ClientWithRelations, LegalArea, RecordKind } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import { getClientDisplayName, getClientDocument } from '@/types/cliente.types'
import { Can } from '@/components/shared/Can'

const AREA_FILTRO_ITEMS: { id: LegalArea | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todos' },
  ...Object.entries(AREAS_JURIDICAS).map(([area, cfg]) => ({
    id: area as LegalArea,
    label: cfg.label,
  })),
]

/** Só na lista de Pessoas, que mostra todo mundo (migration 78). */
type KindFilter = 'todas' | 'clientes' | 'pessoas'

const KIND_FILTER_ITEMS: { id: KindFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'pessoas', label: 'Só pessoas' },
]

interface ScopeText {
  title: string
  count: (n: number) => string
  create: string
  empty: string
  noun: string
}

/** Os textos das duas telas. A lista é a mesma — muda o recorte e o nome. */
const SCOPE_TEXT: Record<CadastroListScope, ScopeText> = {
  clients: {
    title: 'Clientes',
    count: (n) => `${n} clientes cadastrados`,
    create: 'Novo Cliente',
    empty: 'Nenhum cliente encontrado',
    noun: 'clientes',
  },
  people: {
    title: 'Pessoas',
    count: (n) => `${n} pessoas cadastradas`,
    create: 'Nova Pessoa',
    empty: 'Nenhuma pessoa encontrada',
    noun: 'pessoas',
  },
}

function recordKind(client: ClientWithRelations): RecordKind {
  return client.is_client ? 'client' : 'person'
}

// ── Skeleton da tabela ───────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {['Nome', 'Contato', 'Área', 'Documento', 'Atualizado', ''].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Confirmação de exclusão ──────────────────────────────────

interface DeleteDialogProps {
  client: ClientWithRelations | null
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function DeleteDialog({ client, onConfirm, onCancel, isLoading }: DeleteDialogProps) {
  if (!client) return null
  const name = getClientDisplayName(client)

  return (
    <Dialog open={!!client} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {client.is_client ? 'Remover cliente' : 'Remover pessoa'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja remover <span className="font-medium text-foreground">{name}</span>?
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Removendo...' : 'Remover'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Linha da tabela ──────────────────────────────────────────

interface ClienteRowProps {
  cliente: ClientWithRelations
  hasPendency?: boolean
  /** Na lista de Pessoas: selo "Cliente" e o atalho "Tornar cliente". Na de
   * Clientes todo mundo é cliente, e o selo seria ruído. */
  showKind?: boolean
  onVerDetalhe: (c: ClientWithRelations) => void
  onEdit: (c: ClientWithRelations) => void
  onDelete: (c: ClientWithRelations) => void
  onConvert?: (c: ClientWithRelations) => void
}

function ClienteRow({
  cliente,
  hasPendency,
  showKind = false,
  onVerDetalhe,
  onEdit,
  onDelete,
  onConvert,
}: ClienteRowProps) {
  const name = getClientDisplayName(cliente)
  const doc = getClientDocument(cliente)
  const initials = name.slice(0, 2).toUpperCase()

  const primaryPhone = cliente.contacts?.find((c) => c.type === 'phone')?.value ?? cliente.phone
  const primaryEmail = cliente.contacts?.find((c) => c.type === 'email')?.value ?? cliente.email

  return (
    <tr
      className="group border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onVerDetalhe(cliente)}
    >
      {/* Nome */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{name}</p>
              {hasPendency && (
                <span title="Cadastro com pendências" className="inline-flex shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-flex items-center rounded border px-1 py-0 text-xs font-medium',
                  cliente.type === 'company'
                    ? 'border-warning/25 bg-warning/12 text-warning'
                    : 'border-border bg-muted text-muted-foreground'
                )}
              >
                {cliente.type === 'company' ? 'PJ' : 'PF'}
              </span>
              {showKind && cliente.is_client && (
                <span className="inline-flex items-center rounded border border-info/25 bg-info/12 px-1 py-0 text-xs font-medium text-info">
                  Cliente
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Contato */}
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="space-y-0.5">
          {primaryPhone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">{primaryPhone}</span>
            </div>
          )}
          {primaryEmail && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                {primaryEmail}
              </span>
            </div>
          )}
          {!primaryPhone && !primaryEmail && (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </div>
      </td>

      {/* Áreas jurídicas — a coluna é estreita, então só a primeira aparece
          por extenso e o resto vira "+N". */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <LegalAreaBadges
          areas={cliente.legal_areas ?? []}
          max={1}
          empty={<span className="text-xs text-muted-foreground/50">—</span>}
        />
      </td>

      {/* Documento */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs text-muted-foreground font-mono">
          {doc || <span className="text-muted-foreground/40">—</span>}
        </span>
      </td>

      {/* Atualizado */}
      <td className="px-4 py-3 hidden xl:table-cell">
        <span className="text-xs text-muted-foreground">
          {formatRelative(cliente.updated_at)}
        </span>
      </td>

      {/* Ações */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(cliente)}
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {showKind && !cliente.is_client && onConvert && (
            <Can resource="clientes" action="create">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => onConvert(cliente)}
                title="Tornar cliente"
              >
                <UserCheck className="h-3.5 w-3.5" />
              </Button>
            </Can>
          )}
          <Can resource="clientes" action="delete">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 hover:text-destructive"
              onClick={() => onDelete(cliente)}
              title="Remover"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Can>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onVerDetalhe(cliente)}
          >
            Ver
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ── Componente principal ─────────────────────────────────────

/**
 * A lista de Clientes e a de Pessoas (migration 78). É a mesma tela: Pessoas
 * mostra todo mundo, com selo e filtro; Clientes, só quem é cliente.
 */
export function ClientesContent({ scope = 'clients' }: { scope?: CadastroListScope }) {
  const [search, setSearch] = useState('')
  const [areaFiltro, setAreaFiltro] = useState<LegalArea | 'todas'>('todas')
  const [kindFilter, setKindFilter] = useState<KindFilter>('todas')

  const router = useRouter()
  const text = SCOPE_TEXT[scope]
  const isPeople = scope === 'people'

  const [editClient, setEditClient] = useState<ClientWithRelations | null>(null)
  const [deleteClient, setDeleteClient] = useState<ClientWithRelations | null>(null)
  const [convertClient, setConvertClient] = useState<ClientWithRelations | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: clientes = [], isLoading, isError } = useCadastroList(scope)
  const { data: pendencias = [] } = useClientesPendencies()
  const createClientMutation = useCreateCliente()
  const createPersonMutation = useCreatePessoa()
  const createMutation = isPeople ? createPersonMutation : createClientMutation
  const editKind: RecordKind = editClient ? recordKind(editClient) : 'client'
  const updateMutation = useUpdateCliente(editClient?.id ?? '', editKind)
  const deleteMutation = useDeleteCliente(deleteClient ? recordKind(deleteClient) : 'client')

  // O detalhe é uma página própria desde que o modal foi aposentado — a linha
  // navega em vez de abrir sobreposição. Cliente abre na ficha de cliente
  // mesmo vindo de Pessoas: é lá que estão processos, financeiro e pendências.
  function openDetail(client: ClientWithRelations) {
    router.push(client.is_client ? `/clientes/${client.id}` : `/pessoas/${client.id}`)
  }

  const pendingClientIds = useMemo(
    () => new Set(pendencias.map((p) => p.clientId)),
    [pendencias]
  )

  const clientesFiltrados = useMemo(() => {
    const q = search.toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return clientes.filter((c) => {
      const name = getClientDisplayName(c).toLowerCase()
      const doc = getClientDocument(c)
      const docDigits = doc.replace(/\D/g, '')
      const phone = c.phone ?? ''
      const email = c.email ?? ''

      const matchSearch =
        !q ||
        name.includes(q) ||
        email.toLowerCase().includes(q) ||
        doc.includes(q) ||
        phone.includes(q) ||
        (qDigits.length > 0 && docDigits.includes(qDigits)) ||
        c.contacts?.some((ct) => ct.value.toLowerCase().includes(q))

      const matchArea = areaFiltro === 'todas' || (c.legal_areas ?? []).includes(areaFiltro)

      const matchKind =
        kindFilter === 'todas' ||
        (kindFilter === 'clientes' && c.is_client) ||
        (kindFilter === 'pessoas' && !c.is_client)

      return matchSearch && matchArea && matchKind
    })
  }, [clientes, search, areaFiltro, kindFilter])

  function handleCreate(data: CreateClientInput) {
    createMutation.mutate(data, {
      onSuccess: () => setCreateOpen(false),
    })
  }

  function handleEdit(data: CreateClientInput) {
    if (!editClient) return
    updateMutation.mutate(data, {
      onSuccess: () => setEditClient(null),
    })
  }

  function handleDeleteConfirm() {
    if (!deleteClient) return
    deleteMutation.mutate(deleteClient.id, {
      onSuccess: () => setDeleteClient(null),
    })
  }

  const hasFilters = search || areaFiltro !== 'todas' || kindFilter !== 'todas'

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{text.title}</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '...' : text.count(clientes.length)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, CPF/CNPJ..."
              className="pl-9 h-8 w-[220px] text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Can resource="clientes" action="create">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {text.create}
            </Button>
          </Can>
        </div>
      </div>

      {/* ── Filtros: cliente ou não (só em Pessoas) e área jurídica ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {isPeople && (
          <>
            {KIND_FILTER_ITEMS.map((filtro) => (
              <button
                key={filtro.id}
                onClick={() => setKindFilter(filtro.id)}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border',
                  kindFilter === filtro.id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
                )}
              >
                {filtro.label}
              </button>
            ))}
            <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        {AREA_FILTRO_ITEMS.map((filtro) => (
          <button
            key={filtro.id}
            onClick={() => setAreaFiltro(filtro.id)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border',
              areaFiltro === filtro.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {filtro.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ── */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title={`Erro ao carregar ${text.noun}`}
          description="Tente recarregar a página."
        />
      ) : clientesFiltrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={text.empty}
          description={
            hasFilters
              ? 'Tente ajustar a busca ou os filtros.'
              : `Cadastre o primeiro clicando em "${text.create}".`
          }
        />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Contato</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Área</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Documento</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden xl:table-cell">Atualizado</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-card">
              {clientesFiltrados.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  hasPendency={pendingClientIds.has(cliente.id)}
                  showKind={isPeople}
                  onVerDetalhe={openDetail}
                  onEdit={setEditClient}
                  onDelete={setDeleteClient}
                  onConvert={setConvertClient}
                />
              ))}
            </tbody>
          </table>
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Exibindo {clientesFiltrados.length} de {clientes.length} {text.noun}
          </div>
        </div>
      )}

      {/* ── Dialog: Criar ── */}
      <ClienteForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
        kind={isPeople ? 'person' : 'client'}
      />

      {/* ── Dialog: Editar ── */}
      {editClient && (
        <ClienteForm
          open={!!editClient}
          onClose={() => setEditClient(null)}
          onSubmit={handleEdit}
          isLoading={updateMutation.isPending}
          defaultValues={editClient}
          kind={editKind}
        />
      )}

      {/* ── Dialog: Confirmar exclusão ── */}
      <DeleteDialog
        client={deleteClient}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteClient(null)}
        isLoading={deleteMutation.isPending}
      />

      {/* ── Dialog: Tornar cliente — a lista fica onde está e a linha ganha
          o selo ── */}
      {convertClient && (
        <ConvertToClientDialog
          open={!!convertClient}
          onOpenChange={(open) => !open && setConvertClient(null)}
          personId={convertClient.id}
          personName={getClientDisplayName(convertClient)}
        />
      )}

    </div>
  )
}
