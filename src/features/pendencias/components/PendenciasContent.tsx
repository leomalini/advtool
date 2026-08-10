'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  User,
  Building2,
  ArrowRight,
  CheckCircle2,
  Gavel,
  TriangleAlert,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useClientesPendencies, useCliente } from '@/features/clientes/hooks/useClientes'
import { useUpdateCliente } from '@/features/clientes/hooks/useClienteMutations'
import { ClienteForm } from '@/features/clientes/components/ClienteForm'
import { useLegalProcessesPendencies } from '@/features/processos/hooks/useLegalProcesses'
import type { ClientPendency } from '@/types/cliente.types'
import type { ProcessoPendency } from '@/types/legalProcess.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'

// ── Card de pendência de cliente ─────────────────────────────

interface PendencyCardProps {
  pendency: ClientPendency
  onResolve: (id: string) => void
}

function PendencyCard({ pendency, onResolve }: PendencyCardProps) {
  const Icon = pendency.type === 'company' ? Building2 : User
  const initials = pendency.displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-start gap-4 rounded-xl border p-4 hover:bg-muted/20 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/12 text-sm font-semibold text-warning">
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
                ? 'border-warning/25 bg-warning/12 text-warning'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            {pendency.type === 'company' ? 'PJ' : 'PF'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pendency.missingFields.map((field) => (
            <span
              key={field}
              className="inline-flex items-center gap-1 rounded-full bg-warning/12 border border-warning/25 px-2 py-0.5 text-xs text-warning"
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

// ── Card de pendência de processo ────────────────────────────

function ProcessoPendencyCard({ pendency }: { pendency: ProcessoPendency }) {
  const hasHigh = pendency.issues.some((i) => i.severity === 'high')

  return (
    <div
      className={cn(
        'flex items-start gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/20',
        hasHigh && 'border-destructive/30'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          hasHigh ? 'bg-destructive/12 text-destructive' : 'bg-warning/12 text-warning'
        )}
      >
        <Gavel className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{pendency.displayName}</p>
          <span className="font-mono text-[11px] text-muted-foreground">
            {pendency.cnjNumber ?? 'Sem CNJ'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {pendency.issues.map((issue) => (
            <span
              key={issue.kind}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                issue.severity === 'high'
                  ? 'bg-destructive/12 border-destructive/25 text-destructive'
                  : 'bg-warning/12 border-warning/25 text-warning'
              )}
            >
              {issue.severity === 'high' ? (
                <TriangleAlert className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {issue.label}
            </span>
          ))}
        </div>
      </div>

      {/* Deep-link em vez de modal: resolver uma pendência de processo pode
          exigir qualquer aba (cadastrar CNJ, criar tarefa, vincular cliente),
          então o destino certo é o próprio processo. */}
      <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 shrink-0">
        <Link href={`/processos?id=${pendency.legalProcessId}`}>
          Abrir
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

// ── Form de resolução de cliente ─────────────────────────────

function ResolveDialog({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const { data: cliente } = useCliente(clientId ?? '')
  const updateMutation = useUpdateCliente(clientId ?? '')

  function handleSubmit(data: CreateClientInput) {
    updateMutation.mutate(data, { onSuccess: onClose })
  }

  if (clientId && !cliente) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Completar cadastro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <ClienteForm
      open={!!clientId && !!cliente}
      onClose={onClose}
      onSubmit={handleSubmit}
      isLoading={updateMutation.isPending}
      defaultValues={cliente}
    />
  )
}

// ── Componente principal ─────────────────────────────────────

export function PendenciasContent() {
  const {
    data: clientPendencies = [],
    isLoading: loadingClients,
    isError: errorClients,
  } = useClientesPendencies()
  const {
    data: processoPendencies = [],
    isLoading: loadingProcessos,
    isError: errorProcessos,
  } = useLegalProcessesPendencies()

  const [resolveId, setResolveId] = useState<string | null>(null)

  const isLoading = loadingClients || loadingProcessos
  const isError = errorClients || errorProcessos
  const total = clientPendencies.length + processoPendencies.length
  const urgentes = processoPendencies.filter((p) =>
    p.issues.some((i) => i.severity === 'high')
  ).length

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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pendências</h2>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Tudo em ordem — nenhum cadastro ou processo pendente.'
            : `${total} pendência${total !== 1 ? 's' : ''}` +
              (urgentes > 0 ? ` · ${urgentes} exigindo atenção imediata` : '')}
        </p>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border bg-muted/10 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mb-3" />
          <p className="text-sm font-medium">Tudo em ordem!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum cadastro incompleto e nenhum processo parado.
          </p>
        </div>
      ) : (
        <>
          {/* Processos primeiro: um prazo sem tarefa custa mais caro que um
              cadastro sem telefone. */}
          {processoPendencies.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Gavel className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Processos</h3>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                  {processoPendencies.length}
                </span>
              </div>
              <div className="space-y-3">
                {processoPendencies.map((p) => (
                  <ProcessoPendencyCard key={p.legalProcessId} pendency={p} />
                ))}
              </div>
            </section>
          )}

          {clientPendencies.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Clientes</h3>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                  {clientPendencies.length}
                </span>
              </div>
              <div className="space-y-3">
                {clientPendencies.map((p) => (
                  <PendencyCard key={p.clientId} pendency={p} onResolve={setResolveId} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <ResolveDialog clientId={resolveId} onClose={() => setResolveId(null)} />
    </div>
  )
}
