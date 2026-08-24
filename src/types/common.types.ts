import type { AppRole } from './permission.types'

export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  role: AppRole
  /** Desativado em vez de apagado: as FKs de `created_by`/`author_id` impedem
   * remover um usuário sem levar junto o histórico dele. Conta inativa não tem
   * permissão nenhuma — `public.can()` filtra por esta coluna. */
  is_active: boolean
  /** OAB registration number — null for non-attorney profiles. */
  oab_number: string | null
  created_at: string
}
