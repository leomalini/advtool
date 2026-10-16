/** Espelha `public.notifications` (migration 47). */

/** Texto livre no banco, como `activities.type`: um módulo novo traz o seu
 * valor sem migration. Os que existem hoje estão aqui. */
export type NotificationKind =
  | 'publicacao_nova'
  | 'movimentacao_nova'
  | 'webhook_erro'
  // Cobrança por link da InfinitePay (migration 67): baixa feita, ou algo que
  // pede decisão (valor diferente, link cancelado, pagamento em dobro).
  | 'pagamento_recebido'
  | 'pagamento_alerta'
  // Rotina diária de contratos (migration 71): entrou no prazo de aviso, ou
  // passou do fim e continua vigente.
  | 'contrato_vencendo'
  | 'contrato_vencido'
  | (string & {})

export interface Notification {
  id: string
  kind: NotificationKind
  /** Recurso do RBAC exigido para ver a linha — é o que a policy lê. */
  resource: string
  title: string
  body: string | null
  /** Rota interna que o clique abre. */
  link: string | null
  entity_type: string | null
  entity_id: string | null
  /** 'webhook' | 'sync' | 'cadastro' | 'rotina' (job agendado, migration 71). */
  source: string | null
  /** Compartilhado, não por usuário — mesma convenção de `publications.read_at`. */
  read_at: string | null
  created_at: string
}
