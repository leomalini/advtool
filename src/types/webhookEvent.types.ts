/** Espelha `public.webhook_events` (migration 48). */

/**
 * Quem entregou — a coluna `provider`. Cada integração lê só as próprias
 * linhas: o alerta de recusas, o reprocessamento e a lista de Configurações são
 * por provedor, ou a entrega de uma apareceria como se fosse da outra.
 */
export const WEBHOOK_PROVIDERS = {
  buscaProcessos: 'busca_processos',
  infinitePay: 'infinitepay',
} as const

export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[keyof typeof WEBHOOK_PROVIDERS]

export type WebhookEventStatus =
  | 'received'
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'unmatched'
  | 'invalid'
  | 'error'

/** Uma linha de "para onde a informação foi (ou iria)". */
export interface WebhookEventDestination {
  table: string
  id: string | null
  action: 'inserted' | 'duplicate' | 'existing_source' | 'invalid'
  link?: string | null
  detail?: string
}

export interface WebhookEvent {
  id: string
  provider: WebhookProvider
  event: string | null
  external_id: string | null
  /** Null quando não havia segredo configurado para conferir. */
  signature_valid: boolean | null
  is_test: boolean
  /** Simulação: `destinations` diz o que teria acontecido, nada foi gravado. */
  dry_run: boolean
  status: WebhookEventStatus
  destinations: WebhookEventDestination[]
  reason: string | null
  error: string | null
  payload: Record<string, unknown> | null
  headers: Record<string, string | null> | null
  duration_ms: number | null
  received_at: string
  /** Na linha recusada: quando foi reprocessada. Opcional porque a coluna
   * chega com a migration 65 e a lista não pode quebrar antes dela. */
  replayed_at?: string | null
  /** Na linha criada pelo reprocessamento: a recusa de origem. */
  replay_of?: string | null
}

export interface WebhookEventFilters {
  provider?: WebhookProvider
  status?: WebhookEventStatus | null
  /** true = só testes, false = só entregas reais, undefined = tudo. */
  isTest?: boolean
  limit?: number
}
