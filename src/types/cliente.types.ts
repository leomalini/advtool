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

/** Finalidade do endereço. `kind` e não `type` porque `type` do cliente já é
 * PF/PJ, e os dois chegam juntos ao componente pelo embed. */
export type AddressKind = 'residencial' | 'comercial' | 'correspondencia' | 'outro'

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  correspondencia: 'Correspondência',
  outro: 'Outro',
}

/** Endereço do cliente (migration 54). Todos os campos são nuláveis pelo mesmo
 * motivo da qualificação: cadastro incompleto é a regra, e o gerador de
 * petição omite o que faltar em vez de deixar lacuna. */
export interface ClientAddress {
  id: string
  client_id: string
  kind: AddressKind
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  zip: string | null
  /** O que entra na qualificação. No máximo um por cliente — garantido por
   * índice único parcial, não só pelo formulário. */
  is_primary: boolean
  created_at: string
  updated_at: string
}

interface ClientBase extends BaseEntity {
  type: ClientType
  /** Áreas em que o escritório atende este cliente. Plural desde a migration
   * 53: um mesmo cliente costuma ter processos em mais de uma. Vazio = não
   * definida. Não confundir com `crm_items.legal_area`, que é a área do caso. */
  legal_areas: LegalArea[]
  phone: string | null
  email: string | null
  // Endereço saiu daqui na migration 54: virou `client_addresses`, embutida em
  // `ClientWithRelations.addresses`.
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
  /** Opcional como `contacts`: só chega quando o select embute a filha. */
  addresses?: ClientAddress[]
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

export type ClientIssueKind =
  | 'missing_document'
  | 'missing_contact'
  | 'missing_phone'
  | 'missing_email'
  | 'missing_legal_area'
  | 'missing_address'
  | 'missing_birth_date'
  | 'missing_marital_status'
  | 'missing_rg'

/** Mesma forma de `ProcessoIssue`: a tela de pendências mostra os dois lado a
 * lado e não pode tratá-los de jeitos diferentes. */
export interface ClientIssue {
  kind: ClientIssueKind
  label: string
  /** 'high' aparece primeiro e em vermelho — é o que impede de trabalhar
   * (falta de documento, nenhum contato). 'medium' é o que enriquece a
   * qualificação: sem ele a petição sai, só que mais pobre. */
  severity: 'high' | 'medium'
}

export interface ClientPendency {
  clientId: string
  displayName: string
  type: ClientType
  issues: ClientIssue[]
}
