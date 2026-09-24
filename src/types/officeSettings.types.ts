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
  updated_by: string | null
  updated_at: string
}

/** O que a tela de Configurações grava — o timbrado tem fluxo próprio. */
export type OfficeSettingsInput = Omit<
  OfficeSettings,
  'letterhead_path' | 'letterhead_file_name' | 'updated_by' | 'updated_at'
>
