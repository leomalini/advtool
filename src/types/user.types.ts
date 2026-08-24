import type { AppRole } from './permission.types'

/**
 * Um usuário do escritório como a tela de administração precisa vê-lo: o perfil
 * de `public.profiles` somado ao que só existe em `auth.users` (e-mail e estado
 * do convite), que nenhum client de sessão consegue ler.
 *
 * Por isso a tela de Usuários não fala com o Supabase direto como todas as
 * outras: passa por `/api/admin/users`, onde a service_role monta as duas
 * metades depois de confirmar que quem pediu é admin.
 */
export interface AdminUser {
  id: string
  full_name: string
  email: string
  role: AppRole
  is_active: boolean
  oab_number: string | null
  created_at: string
  /** `true` enquanto o convite não foi aceito (e-mail ainda não confirmado). */
  invite_pending: boolean
  last_sign_in_at: string | null
}
