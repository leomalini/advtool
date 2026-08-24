/**
 * Vocabulário de autorização. Espelha exatamente os CHECKs de
 * `public.role_permissions` (migration 34) — se um valor mudar lá, muda aqui.
 *
 * O que NÃO mora aqui é a matriz em si: ela vive só no banco, lida pelas
 * policies via `public.can()` e pelo frontend via `usePermissions()`. Duas
 * cópias divergiriam, e a divergente seria sempre a do frontend, que não tem
 * como impor nada.
 */

export type AppRole = 'admin' | 'attorney' | 'paralegal' | 'finance'

export type Resource =
  | 'dashboard'
  | 'crm'
  | 'processos'
  | 'clientes'
  | 'agenda'
  | 'tarefas'
  | 'documentos'
  | 'financeiro'
  | 'pendencias'
  | 'configuracoes'
  | 'usuarios'

export type Action = 'view' | 'create' | 'update' | 'delete' | 'manage'

export interface RolePermission {
  role: AppRole
  resource: Resource
  action: Action
}
