/** Espelha `public.notifications` (migration 47). */

/** Texto livre no banco, como `activities.type`: um módulo novo traz o seu
 * valor sem migration. Os que existem hoje estão aqui. */
export type NotificationKind =
  | 'publicacao_nova'
  | 'movimentacao_nova'
  | 'webhook_erro'
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
  /** 'webhook' | 'sync' | 'cadastro'. */
  source: string | null
  /** Compartilhado, não por usuário — mesma convenção de `publications.read_at`. */
  read_at: string | null
  created_at: string
}
