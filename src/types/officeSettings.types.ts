import type { D4SignFeatures } from './d4sign.types'

/** Espelha `public.office_settings` (migration 66) — uma linha só. */
export interface OfficeSettings {
  name: string | null
  cnpj: string | null
  /** Registro da sociedade de advogados na OAB. */
  oab_registration: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  /** Sigla da UF, em maiúsculas. */
  state: string | null
  zip: string | null
  phone: string | null
  email: string | null
  /** Papel timbrado (.docx) no bucket `attachments`, em `escritorio/…`. */
  letterhead_path: string | null
  letterhead_file_name: string | null
  /** InfiniteTag da conta que recebe os links de pagamento, sem o `$`
   * (migration 67). */
  infinitepay_handle: string | null
  // ── D4Sign (migration 79) ──
  // Opcionais: a linha só os traz depois da migration, e a tela não pode
  // quebrar antes dela.
  /** Cofre que recebe os envios. Gravado pelo servidor, com o nome junto. */
  d4sign_safe_uuid?: string | null
  d4sign_safe_name?: string | null
  /** O endereço registrado como webhook do cofre, e quando. */
  d4sign_webhook_url?: string | null
  d4sign_webhook_registered_at?: string | null
  /** Recursos do plano, ligados à mão: a API não informa o plano. */
  d4sign_features?: D4SignFeatures
  /** O último saldo lido (`GET /account/balance`) — cada leitura gasta uma
   * chamada das 10 por hora. */
  d4sign_balance_credit?: number | null
  d4sign_balance_sent?: number | null
  d4sign_balance_checked_at?: string | null
  updated_by: string | null
  updated_at: string
}

/** O que o formulário do escritório grava — timbrado, InfiniteTag e D4Sign têm
 * fluxo próprio. */
export type OfficeSettingsInput = Omit<
  OfficeSettings,
  | 'letterhead_path'
  | 'letterhead_file_name'
  | 'infinitepay_handle'
  | 'd4sign_safe_uuid'
  | 'd4sign_safe_name'
  | 'd4sign_webhook_url'
  | 'd4sign_webhook_registered_at'
  | 'd4sign_features'
  | 'd4sign_balance_credit'
  | 'd4sign_balance_sent'
  | 'd4sign_balance_checked_at'
  | 'updated_by'
  | 'updated_at'
>
