'use client'

import { useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { useClientes } from '../hooks/useClientes'
import { useCreateCliente } from '../hooks/useClienteMutations'
import { ClienteForm } from './ClienteForm'
import { getClientDisplayName } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate } from '@/utils/date'

export function ClientesContent() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const debouncedSearch = useDebounce(search)
  const { data: clientes, isLoading } = useClientes()
  const createCliente = useCreateCliente()

  const filtered = clientes?.filter((c) => {
    const name = getClientDisplayName(c as Parameters<typeof getClientDisplayName>[0]).toLowerCase()
    const q = debouncedSearch.toLowerCase()
    return (
      name.includes(q) ||
      c.cpf?.includes(q) ||
      c.cnpj?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    )
  })

  async function handleSubmit(data: CreateClientInput) {
    await createCliente.mutateAsync(data)
    setDialogOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, CNPJ..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Cliente
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description={
            search
              ? 'Tente ajustar a busca.'
              : 'Cadastre o primeiro cliente clicando em "Novo Cliente".'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((cliente) => {
            const displayName = getClientDisplayName(cliente as Parameters<typeof getClientDisplayName>[0])
            return (
              <div
                key={cliente.id}
                className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-sm truncate">{displayName}</p>
                  <Badge variant="outline" className="text-xs shrink-0 ml-2">
                    {cliente.type === 'individual' ? 'PF' : 'PJ'}
                  </Badge>
                </div>
                {cliente.email && (
                  <p className="text-xs text-muted-foreground truncate mb-1">{cliente.email}</p>
                )}
                {cliente.phone && (
                  <p className="text-xs text-muted-foreground mb-1">{cliente.phone}</p>
                )}
                {(cliente.cpf || cliente.cnpj) && (
                  <p className="text-xs text-muted-foreground">
                    {cliente.cpf ?? cliente.cnpj}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Desde {formatDate(cliente.created_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <ClienteForm onSubmit={handleSubmit} isLoading={createCliente.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
