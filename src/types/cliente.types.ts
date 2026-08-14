import type { BaseEntity, Profile } from './common.types'

export type ClientType = 'individual' | 'company'

export type LegalArea =
  | 'trabalhista'
  | 'civel'
  | 'familia'
  | 'tributario'
  | 'criminal'
  | 'previdenciario'
  | 'consumidor'

export type ClientSex = 'masculino' | 'feminino' | 'outro'

export type MaritalStatus =
  | 'solteiro'
  | 'casado'
  | 'divorciado'
  | 'viuvo'
  | 'uniao_estavel'
  | 'separado'

export const SEX_LABELS: Record<ClientSex, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
}

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  uniao_estavel: 'União estável',
  separado: 'Separado(a)',
}

/** Nota do cliente. Mesma forma de `CrmItemComment` — as duas tabelas são
 * separadas, mas a apresentação é a mesma (ver `CommentThread`). */
export interface ClientComment {
  id: string
  client_id: string
  author_id: string
  content: string
  created_at: string
  author?: {
    id: string
    full_name: string
    avatar_url: string | null
    role: string
    created_at: string
  }
}

export interface ClientContact {
  id: string
  client_id: string
  type: 'phone' | 'email'
  value: string
  label: string | null
  is_primary: boolean
  created_at: string
}

interface ClientBase extends BaseEntity {
  type: ClientType
  legal_area: LegalArea | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  notes: string | null
  assigned_to: string | null
  created_by: string

  // ── Qualificação (migration 30) ────────────────────────────────────────────
  // Tudo nullable: a maioria dos clientes entra só com nome e documento, e o
  // gerador da qualificação omite o que faltar.
  birth_date: string | null
  sex: ClientSex | null
  /** Adjetivo literal usado na petição ("brasileiro"/"brasileira"), não o país. */
  nationality: string | null
  marital_status: MaritalStatus | null
  profession: string | null
  rg: string | null
  /** Órgão emissor com UF, ex. "SSP/ES". */
  rg_issuer: string | null
  tags: string[]
}

export interface IndividualClient extends ClientBase {
  type: 'individual'
  name: string
  cpf: string | null
  company_name: null
  trade_name: null
  cnpj: null
  contact_person: null
}

export interface CompanyClient extends ClientBase {
  type: 'company'
  name: null
  cpf: null
  company_name: string
  trade_name: string | null
  cnpj: string | null
  contact_person: string | null
}

export type Client = IndividualClient | CompanyClient

export interface ClientWithRelations extends ClientBase {
  assignee?: Profile | null
  creator?: Profile
  contacts?: ClientContact[]
  name: string | null
  cpf: string | null
  company_name: string | null
  trade_name: string | null
  cnpj: string | null
  contact_person: string | null
}

export function getClientDisplayName(client: Client | ClientWithRelations): string {
  if (client.type === 'individual') return client.name ?? ''
  return (client as CompanyClient).trade_name ?? (client as CompanyClient).company_name ?? ''
}

export function getClientDocument(client: Client | ClientWithRelations): string {
  if (client.type === 'individual') return client.cpf ?? ''
  return (client as CompanyClient).cnpj ?? ''
}

export interface ClientPendency {
  clientId: string
  displayName: string
  type: ClientType
  missingFields: string[]
}
