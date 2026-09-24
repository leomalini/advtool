'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import { getWebhookEvents } from '../services/webhookEvents.service'
import type { WebhookEventFilters } from '@/types/webhookEvent.types'
import type { WebhookScenario } from '@/lib/buscaprocessos/webhookFixtures'
import type { BpWebhookPayload } from '@/lib/buscaprocessos/types'
// Só tipos: `import type` some na compilação, e nada do módulo de servidor (que
// lê os segredos do ambiente) chega ao bundle do navegador.
import type { CredentialCheck, CredentialKind } from '@/lib/buscaprocessos/signature'
import type { OriginDelivery } from '@/lib/buscaprocessos/webhookAlerts'
import type { PendingCount, ReplayResult } from '@/lib/buscaprocessos/webhookReplay'

const supabase = createClient()

export const webhookKeys = {
  all: ['webhook_events'] as const,
  list: (filters: WebhookEventFilters) => ['webhook_events', 'list', filters] as const,
  status: () => ['webhook_events', 'status'] as const,
}

/** Situação do endpoint. Só admin: a rota é `requireAdminApi`. */
export interface WebhookEndpointStatus {
  /** URL registrada na BuscaProcessos ao ativar o monitoramento por OAB. */
  registeredUrl: string | null
  /** Para onde o modo HTTP dispara — aceita localhost. */
  localUrl: string | null
  secretConfigured: boolean
  /** Token Bearer — a outra forma de autenticação que a conta oferece. */
  tokenConfigured: boolean
  serviceRoleConfigured: boolean
  canSendHttp: boolean
  /** O que o log diz. Null quando não dá para ler (sem chave de serviço). */
  health: WebhookHealth | null
}

export interface WebhookHealth {
  /** A última entrega da BuscaProcessos — testes e reprocessamentos fora. */
  lastDelivery: OriginDelivery | null
  /** `available: false` = migration 65 não aplicada. */
  pendingReplay: PendingCount
}

/** Compara o valor colado com a variável do servidor. Nada é gravado. */
export function useCheckWebhookCredential() {
  return useMutation({
    mutationFn: async (input: {
      kind: CredentialKind
      value: string
    }): Promise<CredentialCheck> => {
      const res = await fetch('/api/webhooks/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao conferir a credencial.')
      return json as CredentialCheck
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

/** A rota só responde o ramo disponível; o outro vira erro 409. */
export type ReplayRoundResult = Extract<ReplayResult, { available: true }>

/** Uma rodada de reprocessamento das recusas pendentes. */
export function useReplayRejectedWebhooks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<ReplayRoundResult> => {
      const res = await fetch('/api/webhooks/replay', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao reprocessar as recusas.')
      return json as ReplayRoundResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all })
      queryClient.invalidateQueries({ queryKey: publicationKeys.all })
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useWebhookEndpointStatus(enabled: boolean) {
  return useQuery({
    queryKey: webhookKeys.status(),
    enabled,
    queryFn: async (): Promise<WebhookEndpointStatus> => {
      const res = await fetch('/api/webhooks/test')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao ler a situação do endpoint.')
      return json as WebhookEndpointStatus
    },
  })
}

export function useWebhookEvents(filters: WebhookEventFilters = {}) {
  return useQuery({
    queryKey: webhookKeys.list(filters),
    queryFn: () => getWebhookEvents(filters),
  })
}

/**
 * A lista se atualiza sozinha enquanto alguém dispara testes — é o que
 * transforma a tela em ferramenta de validação em vez de relatório.
 */
export function useRealtimeWebhookEvents(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('webhook-events-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'webhook_events' },
        () => queryClient.invalidateQueries({ queryKey: webhookKeys.all }),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}

export interface SendTestWebhookInput {
  scenario?: WebhookScenario
  /** Corpo editado à mão. Tem precedência sobre o cenário. */
  payload?: Record<string, unknown>
  cnj?: string
  conteudo?: string
  date?: string
  dryRun: boolean
  mode: 'inline' | 'http'
}

export interface SendTestWebhookResult {
  status?: string
  destinations?: {
    table: string
    id: string | null
    action: string
    link?: string | null
    detail?: string
  }[]
  reason?: string
  error?: string
  eventId?: string | null
  durationMs?: number
  dryRun?: boolean
  mode?: string
  url?: string
  signed?: boolean
  httpStatus?: number
  response?: unknown
  payload?: BpWebhookPayload
}

export function useSendTestWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SendTestWebhookInput): Promise<SendTestWebhookResult> => {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao disparar o teste.')
      return json as SendTestWebhookResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all })
      // Só invalida a fila quando algo pode ter sido gravado.
      if (!result.dryRun) queryClient.invalidateQueries({ queryKey: publicationKeys.all })
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useClearTestWebhookEvents() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<number> => {
      const res = await fetch('/api/webhooks/test', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao limpar os eventos.')
      return json.removed as number
    },
    onSuccess: (removed) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.all })
      toast.success(
        removed > 0 ? `${removed} evento(s) de teste removido(s).` : 'Nenhum evento de teste.',
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
