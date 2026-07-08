'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Users, Phone, Mail, ArrowRight, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ClienteDetailModal } from './ClienteDetailModal'
import { ClienteForm } from './ClienteForm'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import { formatRelative } from '@/utils/date'
import { useClientes } from '../hooks/useClientes'
import { useCreateCliente, useUpdateCliente, useDeleteCliente } from '../hooks/useClienteMutations'
import type { ClientWithRelations, LegalArea } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import { getClientDisplayName, getClientDocument } from '@/types/cliente.types'

const AREA_FILTRO_ITEMS: { id: LegalArea | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todos' },
  ...Object.entries(AREAS_JURIDICAS).map(([area, cfg]) => ({
    id: area as LegalArea,
    label: cfg.label,
  })),
]

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
            Remover cliente
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
  onVerDetalhe: (c: ClientWithRelations) => void
  onEdit: (c: ClientWithRelations) => void
  onDelete: (c: ClientWithRelations) => void
}

function ClienteRow({ cliente, onVerDetalhe, onEdit, onDelete }: ClienteRowProps) {
  const name = getClientDisplayName(cliente)
  const doc = getClientDocument(cliente)
  const area = cliente.legal_area ? AREAS_JURIDICAS[cliente.legal_area] : null
  const initials = name.slice(0, 2).toUpperCase()

  const primaryPhone = cliente.contacts?.find((c) => c.type === 'phone')?.value ?? cliente.phone
  const primaryEmail = cliente.contacts?.find((c) => c.type === 'email')?.value ?? cliente.email

  return (
    <tr className="group border-b last:border-0 hover:bg-muted/30 transition-colors">
      {/* Nome */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            <span
              className={cn(
                'inline-flex items-center rounded border px-1 py-0 text-xs font-medium',
                cliente.type === 'company'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              )}
            >
              {cliente.type === 'company' ? 'PJ' : 'PF'}
            </span>
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

      {/* Área jurídica */}
      <td className="px-4 py-3 hidden sm:table-cell">
        {area ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              area.bg,
              area.color
            )}
          >
            {area.label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
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
      <td className="px-4 py-3">
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
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:text-destructive"
            onClick={() => onDelete(cliente)}
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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

export function ClientesContent() {
  const [search, setSearch] = useState('')
  const [areaFiltro, setAreaFiltro] = useState<LegalArea | 'todas'>('todas')

  const [detailClient, setDetailClient] = useState<ClientWithRelations | null>(null)
  const [editClient, setEditClient] = useState<ClientWithRelations | null>(null)
  const [deleteClient, setDeleteClient] = useState<ClientWithRelations | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: clientes = [], isLoading, isError } = useClientes()
  const createMutation = useCreateCliente()
  const updateMutation = useUpdateCliente(editClient?.id ?? '')
  const deleteMutation = useDeleteCliente()

  const clientesFiltrados = useMemo(() => {
    const q = search.toLowerCase()
    return clientes.filter((c) => {
      const name = getClientDisplayName(c).toLowerCase()
      const doc = getClientDocument(c)
      const phone = c.phone ?? ''
      const email = c.email ?? ''

      const matchSearch =
        !q ||
        name.includes(q) ||
        email.toLowerCase().includes(q) ||
        doc.includes(q) ||
        phone.includes(q) ||
        c.contacts?.some((ct) => ct.value.toLowerCase().includes(q))

      const matchArea = areaFiltro === 'todas' || c.legal_area === areaFiltro

      return matchSearch && matchArea
    })
  }, [clientes, search, areaFiltro])

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

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? '...' : `${clientes.length} clientes cadastrados`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, CPF..."
              className="pl-9 h-8 w-[220px] text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* ── Filtros por área jurídica ── */}
      <div className="flex items-center gap-2 flex-wrap">
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
          title="Erro ao carregar clientes"
          description="Tente recarregar a página."
        />
      ) : clientesFiltrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description={
            search || areaFiltro !== 'todas'
              ? 'Tente ajustar a busca ou os filtros.'
              : 'Cadastre o primeiro cliente clicando em "Novo Cliente".'
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
                  onVerDetalhe={setDetailClient}
                  onEdit={setEditClient}
                  onDelete={setDeleteClient}
                />
              ))}
            </tbody>
          </table>
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Exibindo {clientesFiltrados.length} de {clientes.length} clientes
          </div>
        </div>
      )}

      {/* ── Dialog: Criar cliente ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
            <ClienteForm
              onSubmit={handleCreate}
              isLoading={createMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar cliente ── */}
      <Dialog open={!!editClient} onOpenChange={(open) => !open && setEditClient(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Editar — {editClient ? getClientDisplayName(editClient) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
            {editClient && (
              <ClienteForm
                onSubmit={handleEdit}
                isLoading={updateMutation.isPending}
                defaultValues={editClient}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar exclusão ── */}
      <DeleteDialog
        client={deleteClient}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteClient(null)}
        isLoading={deleteMutation.isPending}
      />

      {/* ── Modal de detalhe ── */}
      <ClienteDetailModal
        cliente={detailClient}
        open={!!detailClient}
        onOpenChange={(open) => !open && setDetailClient(null)}
        onEdit={setEditClient}
      />
    </div>
  )
}
