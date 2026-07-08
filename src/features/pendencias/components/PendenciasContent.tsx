'use client'

import { useState } from 'react'
import { AlertCircle, User, Building2, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useClientesPendencies } from '@/features/clientes/hooks/useClientes'
import { ClienteDetailModal } from '@/features/clientes/components/ClienteDetailModal'
import { ClienteForm } from '@/features/clientes/components/ClienteForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCliente } from '@/features/clientes/hooks/useClientes'
import { useUpdateCliente } from '@/features/clientes/hooks/useClienteMutations'
import type { ClientPendency } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'

// ── Card de pendência individual ─────────────────────────────

interface PendencyCardProps {
  pendency: ClientPendency
  onResolve: (id: string) => void
}

function PendencyCard({ pendency, onResolve }: PendencyCardProps) {
  const Icon = pendency.type === 'company' ? Building2 : User
  const initials = pendency.displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-start gap-4 rounded-xl border p-4 hover:bg-muted/20 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
        {initials}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-sm font-medium">{pendency.displayName || 'Cliente sem nome'}</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium',
              pendency.type === 'company'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            )}
          >
            {pendency.type === 'company' ? 'PJ' : 'PF'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pendency.missingFields.map((field) => (
            <span
              key={field}
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700"
            >
              <AlertCircle className="h-3 w-3" />
              {field}
            </span>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 shrink-0"
        onClick={() => onResolve(pendency.clientId)}
      >
        Preencher
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── Form de resolução ────────────────────────────────────────

interface ResolveDialogProps {
  clientId: string | null
  onClose: () => void
}

function ResolveDialog({ clientId, onClose }: ResolveDialogProps) {
  const { data: cliente } = useCliente(clientId ?? '')
  const updateMutation = useUpdateCliente(clientId ?? '')

  function handleSubmit(data: CreateClientInput) {
    updateMutation.mutate(data, { onSuccess: onClose })
  }

  return (
    <Dialog open={!!clientId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Completar cadastro</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 pb-2">
          {cliente ? (
            <ClienteForm
              onSubmit={handleSubmit}
              isLoading={updateMutation.isPending}
              defaultValues={cliente}
            />
          ) : (
            <div className="space-y-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Componente principal ─────────────────────────────────────

export function PendenciasContent() {
  const { data: pendencies = [], isLoading, isError } = useClientesPendencies()
  const [resolveId, setResolveId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Pendências</h2>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Pendências</h2>
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          Erro ao carregar pendências. Tente recarregar a página.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Pendências</h2>
        <p className="text-sm text-muted-foreground">
          {pendencies.length === 0
            ? 'Todos os cadastros estão completos.'
            : `${pendencies.length} cliente${pendencies.length !== 1 ? 's' : ''} com dados incompletos`}
        </p>
      </div>

      {/* Estado vazio */}
      {pendencies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border bg-muted/10 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
          <p className="text-sm font-medium">Tudo em ordem!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum cadastro com campos obrigatórios faltando.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendencies.map((p) => (
            <PendencyCard
              key={p.clientId}
              pendency={p}
              onResolve={setResolveId}
            />
          ))}
        </div>
      )}

      {/* Dialog para completar cadastro */}
      <ResolveDialog clientId={resolveId} onClose={() => setResolveId(null)} />
    </div>
  )
}
