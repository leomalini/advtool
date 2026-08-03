'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Gavel, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useLegalProcesses } from '../hooks/useLegalProcesses'
import { useCreateLegalProcess } from '../hooks/useLegalProcessMutations'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { ProcessoForm } from './ProcessoForm'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { formatCnjNumber } from '@/utils/cnj'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'

interface ProcessoComboboxProps {
  value: string | null | undefined
  onChange: (legalProcessId: string | null) => void
  placeholder?: string
  className?: string
}

function processoLabel(p: LegalProcessWithRelations): string {
  return getCrmItemClientName(p.crm_item)
}

/** Typeable processo picker — matches on client name or CNJ, digits-only so
 * "0000123" finds "0000123-45.2026…" whether or not the user types the mask.
 * Same shape as ClienteCombobox so both fields in the event form behave alike. */
export function ProcessoCombobox({
  value,
  onChange,
  placeholder = 'Buscar processo por cliente ou CNJ...',
  className,
}: ProcessoComboboxProps) {
  const { data: processos = [] } = useLegalProcesses()
  const createProcesso = useCreateLegalProcess()
  const workflow = useWorkflow('wf-processos')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 200)

  const selected = processos.find((p) => p.id === value) ?? null

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return processos.slice(0, 30)

    const qDigits = q.replace(/\D/g, '')
    return processos
      .filter((p) => {
        if (processoLabel(p).toLowerCase().includes(q)) return true
        const cnjDigits = (p.cnj_number ?? '').replace(/\D/g, '')
        return qDigits.length > 0 && cnjDigits.includes(qDigits)
      })
      .slice(0, 30)
  }, [processos, debouncedQuery])

  function select(id: string | null) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  async function handleCreateSubmit(data: LegalProcessInput) {
    const created = await createProcesso.mutateAsync(data)
    setCreateOpen(false)
    select(created.id)
  }

  // If the typed query looks like a CNJ, carry it into the new-processo form.
  const queryDigits = query.replace(/\D/g, '')
  const createDefaults: Partial<LegalProcessInput> = {
    column_id: workflow?.colunas[0]?.id ?? '',
    ...(queryDigits.length >= 4 ? { cnj_number: formatCnjNumber(query) } : {}),
  }

  const createButton = (
    <button
      type="button"
      onMouseDown={() => setCreateOpen(true)}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left text-primary hover:bg-accent"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" />
      Cadastrar novo processo
    </button>
  )

  const createDialog = (
    <ProcessoForm
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      onSubmit={handleCreateSubmit}
      isLoading={createProcesso.isPending}
      defaultValues={createDefaults}
    />
  )

  if (!open) {
    return (
      <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-left',
          'hover:border-ring/50 transition-colors',
          className
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <Gavel className="h-3.5 w-3.5 shrink-0 text-info" />
            <span className="truncate">{processoLabel(selected)}</span>
            {selected.cnj_number && (
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                {selected.cnj_number}
              </span>
            )}
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {createDialog}
      </>
    )
  }

  return (
    <>
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

        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onMouseDown={() => select(p.id)}
            className={cn(
              'flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground',
              value === p.id && 'text-accent-foreground'
            )}
          >
            <Check
              className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', value === p.id ? 'opacity-100' : 'opacity-0')}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm truncate">{processoLabel(p)}</span>
              <span className="block font-mono text-[11px] text-muted-foreground truncate">
                {p.cnj_number ?? 'Sem CNJ'}
              </span>
            </span>
          </button>
        ))}

        {filtered.length === 0 ? (
          <div className="px-1 py-1">
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nenhum processo encontrado{query.trim() ? ` para "${query.trim()}"` : ''}.
            </p>
            {createButton}
          </div>
        ) : (
          <div className="mt-1 border-t pt-1">{createButton}</div>
        )}
      </div>
    </div>
    {createDialog}
    </>
  )
}
