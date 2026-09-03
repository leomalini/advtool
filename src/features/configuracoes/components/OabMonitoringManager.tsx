'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BellRing, Check, Loader2, Radio, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/** Preço da BuscaProcessos, em BRL, por inscrição nova a cada 30 dias. */
const PRICE_PER_OAB = 0.9

interface OabMonitoring {
  oab_state: string
  oab_number: string
  /** Quem no escritório usa essa inscrição. Mais de um quando dois cadastros
   * repetem o mesmo número. */
  names: string[]
  active: boolean
  webhook_url: string | null
  created_at: string | null
}

interface OabMonitoringResponse {
  items: OabMonitoring[]
  /** O endereço do nosso endpoint de recebimento, montado a partir de
   * APP_PUBLIC_URL. `null` quando a base não foi configurada. */
  expectedWebhookUrl: string | null
}

const QUERY_KEY = ['buscaprocessos', 'intimacoes', 'oab'] as const

async function fetchMonitorings(): Promise<OabMonitoringResponse> {
  const res = await fetch('/api/buscaprocessos/intimacoes/oab')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Falha ao consultar os monitoramentos.')
  return json as OabMonitoringResponse
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

/**
 * Monitoramento de publicações por inscrição na OAB.
 *
 * As inscrições vêm dos perfis, em Usuários — não há lista separada aqui de
 * propósito: manter duas garantiria que uma ficasse desatualizada. Quem não
 * tiver OAB e UF preenchidos simplesmente não aparece.
 *
 * Ligar é a única operação cobrada da tela, e é recorrente: R$ 0,90 por
 * inscrição a cada 30 dias, enquanto estiver ativa. Por isso confirma antes.
 */
export function OabMonitoringManager() {
  const queryClient = useQueryClient()
  const [pendingActivation, setPendingActivation] = useState<OabMonitoring | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchMonitorings,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const activate = useMutation({
    mutationFn: async (oab: OabMonitoring) => {
      const res = await fetch('/api/buscaprocessos/intimacoes/oab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oabs: [{ oab_state: oab.oab_state, oab_number: oab.oab_number }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao ativar o monitoramento.')
      return json as { newlyCharged: number; estimatedCost: number; callbackEnabled: boolean }
    },
    onSuccess: (result) => {
      invalidate()
      toast.success(
        result.newlyCharged > 0
          ? `Monitoramento ativo. Custo: ${formatCurrency(result.estimatedCost)} a cada 30 dias.`
          : 'A inscrição já estava monitorada — nada foi cobrado.',
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const fixWebhook = useMutation({
    mutationFn: async (oab: OabMonitoring) => {
      const params = new URLSearchParams({
        oab_state: oab.oab_state,
        oab_number: oab.oab_number,
      })
      const res = await fetch(`/api/buscaprocessos/intimacoes/oab?${params}`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao atualizar o webhook.')
      return json
    },
    onSuccess: () => {
      invalidate()
      toast.success('Webhook reapontado para este sistema.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deactivate = useMutation({
    mutationFn: async (oab: OabMonitoring) => {
      const params = new URLSearchParams({
        oab_state: oab.oab_state,
        oab_number: oab.oab_number,
      })
      const res = await fetch(`/api/buscaprocessos/intimacoes/oab?${params}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao desativar o monitoramento.')
      return json
    },
    onSuccess: () => {
      invalidate()
      toast.success('Monitoramento desativado. A cobrança mensal para aqui.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const items = data?.items ?? []
  const ativos = items.filter((item) => item.active).length
  const isMutating = activate.isPending || deactivate.isPending || fixWebhook.isPending
  const expectedWebhook = data?.expectedWebhookUrl ?? null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Monitoramento de publicações</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A BuscaProcessos varre os diários oficiais atrás das inscrições ativas aqui. As
          publicações encontradas entram no módulo de Publicações.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            <strong className="tabular-nums">{ativos}</strong> de {items.length} inscrição(ões)
            ativa(s)
          </span>
        </div>
        {ativos > 0 && (
          <span className="text-sm text-muted-foreground">
            · {formatCurrency(ativos * PRICE_PER_OAB)} a cada 30 dias
          </span>
        )}
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 text-xs',
            expectedWebhook ? 'text-success' : 'text-muted-foreground',
          )}
        >
          <BellRing className="h-3.5 w-3.5" />
          {expectedWebhook
            ? 'Entrega automática configurada'
            : 'Sem endereço público: use "Buscar publicações" para trazer'}
        </span>
      </div>

      {/* O endereço que a BuscaProcessos chama quando encontra uma publicação:
          é uma rota deste sistema, não um serviço de fora. */}
      <div className="rounded-lg border border-border p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Endereço que recebe os eventos
        </p>
        {expectedWebhook ? (
          <p className="mt-1 break-all font-mono text-xs">{expectedWebhook}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Defina <code className="rounded bg-muted px-1 py-0.5 text-xs">APP_PUBLIC_URL</code> com
            o endereço público da aplicação. O caminho do webhook é fixo e montado a partir dela —
            localhost não vale, a BuscaProcessos precisa alcançar o endereço.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">
            {(error as Error)?.message ?? 'Não foi possível consultar os monitoramentos.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum perfil tem OAB e UF preenchidos.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Preencha a inscrição na aba Usuários — é de lá que sai a lista monitorada.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <div
              key={`${item.oab_state}:${item.oab_number}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  item.active
                    ? 'bg-success/12 text-success'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {item.active ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium tabular-nums">
                  OAB/{item.oab_state} {item.oab_number}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.names.filter(Boolean).join(', ') || 'Sem nome no perfil'}
                </p>
              </div>

              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  item.active
                    ? 'bg-success/12 text-success'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {item.active ? 'Monitorando' : 'Inativa'}
              </span>

              {/* Monitoramento ativo apontando para outro lugar entrega os
                  eventos em outro sistema — e daqui pareceria só silêncio. */}
              {item.active && expectedWebhook && item.webhook_url !== expectedWebhook && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-warning/40 text-warning hover:bg-warning/10"
                  disabled={isMutating}
                  onClick={() => fixWebhook.mutate(item)}
                >
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {item.webhook_url ? 'Webhook aponta para outro lugar' : 'Sem webhook'}
                </Button>
              )}

              {item.active ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  onClick={() => deactivate.mutate(item)}
                >
                  {deactivate.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Desativar
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={isMutating}
                  onClick={() => setPendingActivation(item)}
                >
                  {activate.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Ativar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingActivation)}
        onOpenChange={(open) => !open && setPendingActivation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar monitoramento desta inscrição?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A BuscaProcessos passa a varrer os diários oficiais atrás de{' '}
                  <strong>
                    OAB/{pendingActivation?.oab_state} {pendingActivation?.oab_number}
                  </strong>
                  .
                </p>
                <p>
                  Custa <strong>{formatCurrency(PRICE_PER_OAB)} a cada 30 dias</strong>, de forma
                  recorrente, enquanto estiver ativa. Desativar interrompe a cobrança seguinte.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingActivation) activate.mutate(pendingActivation)
                setPendingActivation(null)
              }}
            >
              Ativar monitoramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
