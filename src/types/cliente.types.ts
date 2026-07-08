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
  lead_id: string | null
  assigned_to: string | null
  created_by: string
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

export interface ClientAttachment {
  id: string
  client_id: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  uploaded_by: string
  created_at: string
  uploader?: Profile
}

export interface ClientPendency {
  clientId: string
  displayName: string
  type: ClientType
  missingFields: string[]
}
