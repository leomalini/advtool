'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useClientes } from '../hooks/useClientes'
import { useCreateCliente } from '../hooks/useClienteMutations'
import { getClientDisplayName } from '@/types/cliente.types'
import { ClienteForm } from './ClienteForm'

interface ClienteComboboxProps {
  value: string | null | undefined
  onChange: (clientId: string | null) => void
  placeholder?: string
  className?: string
}

/** Typeable, debounced client search — replaces a plain closed Select for picking a client. */
export function ClienteCombobox({ value, onChange, placeholder = 'Buscar cliente...', className }: ClienteComboboxProps) {
  const { data: clients = [] } = useClientes()
  const createCliente = useCreateCliente()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 200)

  const selected = clients.find((c) => c.id === value) ?? null

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const list = !q ? clients : clients.filter((c) => getClientDisplayName(c).toLowerCase().includes(q))
    return list.slice(0, 30)
  }, [clients, debouncedQuery])

  function select(clientId: string | null) {
    onChange(clientId)
    setOpen(false)
    setQuery('')
  }

  async function handleCreateSubmit(data: Parameters<typeof createCliente.mutateAsync>[0]) {
    const created = await createCliente.mutateAsync(data)
    setCreateOpen(false)
    select(created.id)
  }

  return (
    <>
      {open ? (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={placeholder}
              className={cn(
                'w-full pl-8 pr-3 py-2 rounded-lg border border-ring bg-card text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring/20',
                className
              )}
            />
          </div>
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-md py-1">
            <button
              type="button"
              onMouseDown={() => select(null)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground',
                !value && 'text-accent-foreground'
              )}
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', value ? 'opacity-0' : 'opacity-100')} />
              Nenhum
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => select(c.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left truncate hover:bg-accent hover:text-accent-foreground',
                  value === c.id && 'text-accent-foreground'
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{getClientDisplayName(c)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-1 py-1">
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nenhum cliente encontrado{query.trim() ? ` para "${query.trim()}"` : ''}.
                </p>
                <button
                  type="button"
                  onMouseDown={() => setCreateOpen(true)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left text-primary hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Cadastrar novo cliente
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-left',
            'hover:border-ring/50 transition-colors',
            className
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? getClientDisplayName(selected) : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      )}

      <ClienteForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        isLoading={createCliente.isPending}
        defaultValues={query.trim() ? { name: query.trim() } : undefined}
      />
    </>
  )
}
