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
  oab_state: string | null
  created_at: string
  /** `true` enquanto o convite não foi aceito (e-mail ainda não confirmado). */
  invite_pending: boolean
  last_sign_in_at: string | null
}

/**
 * Resultado de convidar alguém.
 *
 * `action_link` só vem quando o e-mail NÃO saiu — aí a conta existe, mas o
 * convite precisa ser entregue à mão. Ver `POST /api/admin/users`.
 */
export interface InviteUserResult {
  id: string
  action_link?: string
  reason?: string
}

/** Como o convite deve ser reemitido. */
export type ResendChannel = 'email' | 'link'

/**
 * Resultado da reemissão de convite.
 *
 * Discriminado por `sent` porque os dois desfechos exigem telas diferentes: no
 * primeiro basta um toast, no segundo o admin precisa copiar um link e entregar
 * por fora. Ver `POST /api/admin/users/[id]/resend`.
 */
export type ResendInviteResult =
  | { sent: true; email: string }
  | {
      sent: false
      email: string
      /** Link de convite válido, para entregar manualmente. */
      action_link: string
      /**
       * Por que o e-mail não saiu — presente só quando o envio foi TENTADO e
       * falhou. Ausente quando o admin pediu o link de propósito (`via=link`),
       * que é o modo de quem ainda não configurou SMTP.
       */
      reason?: string
    }
