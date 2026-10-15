import type { ClientSex, ClientType, MaritalStatus } from './cliente.types'
import type { Profile } from './common.types'
import { todayISO } from './financialEntry.types'

/** Em que papel o escritório redige o contrato (migration 69). */
export type ContractKind = 'honorarios' | 'cliente_terceiros' | 'escritorio'

export type ContractStatus =
  | 'rascunho'
  | 'aguardando_assinatura'
  | 'vigente'
  | 'encerrado'
  | 'rescindido'

/** O que um arquivo é para o contrato. */
export type ContractFileRole = 'minuta' | 'assinado' | 'anexo'

/** A ordem é a dos seletores. */
export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  honorarios: 'Honorários',
  cliente_terceiros: 'Do cliente com terceiros',
  escritorio: 'Do escritório',
}

export const CONTRACT_KIND_HINTS: Record<ContractKind, string> = {
  honorarios: 'O escritório com o cliente',
  cliente_terceiros: 'Locação, compra e venda… redigido para o cliente',
  escritorio: 'Aluguel, fornecedores, sistemas',
}

/** A ordem é a do ciclo. */
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_assinatura: 'Aguardando assinatura',
  vigente: 'Vigente',
  encerrado: 'Encerrado',
  rescindido: 'Rescindido',
}

export const CONTRACT_FILE_ROLE_LABELS: Record<ContractFileRole, string> = {
  minuta: 'Minuta',
  assinado: 'Assinado',
  anexo: 'Anexo',
}

export const CONTRACT_KINDS = Object.keys(CONTRACT_KIND_LABELS) as ContractKind[]
export const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]
export const CONTRACT_FILE_ROLES = Object.keys(CONTRACT_FILE_ROLE_LABELS) as ContractFileRole[]

export interface Contract {
  id: string
  kind: ContractKind
  title: string
  status: ContractStatus
  client_id: string | null
  legal_process_id: string | null
  template_id: string | null
  responsible_id: string | null
  /** numeric(12,2) — PostgREST devolve como number. */
  total_amount: number | null
  installments: number | null
  first_due_date: string | null
  success_fee_percent: number | null
  start_date: string | null
  end_date: string | null
  notice_days: number
  auto_renew: boolean
  adjustment_index: string | null
  signed_at: string | null
  notes: string | null
  /** Migration 70. Validado no app — ver `parseContractTemplateValues`. */
  template_values: ContractTemplateValues
  created_by: string
  created_at: string
  updated_at: string
}

/** O que `getClientDisplayName` precisa — mesmo recorte dos embeds. */
interface ClientSummary {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

export interface ContractWithRelations extends Contract {
  client?: ClientSummary | null
  legal_process?: { id: string; cnj_number: string | null } | null
  responsible?: Pick<Profile, 'id' | 'full_name'> | null
  /** Só o papel de cada arquivo: a lista mostra se já há versão assinada. */
  documents?: { id: string; contract_file_role: ContractFileRole }[]
}

export interface ContractStatusChange {
  id: string
  contract_id: string
  from_status: ContractStatus | null
  to_status: ContractStatus
  changed_by: string | null
  changed_at: string
  changer?: Pick<Profile, 'id' | 'full_name'> | null
}

/**
 * O que a tela mostra: o status guardado, ou "vencido"/"vencendo" para o
 * vigente com fim próximo ou passado. Calculado, nunca gravado — um estado
 * guardado ficaria errado no dia seguinte sem ninguém mexer no contrato
 * (migration 69). Fonte única do badge, do filtro e dos indicadores.
 */
export type ContractSituation = ContractStatus | 'vencendo' | 'vencido'

export const CONTRACT_SITUATION_LABELS: Record<ContractSituation, string> = {
  ...CONTRACT_STATUS_LABELS,
  vencendo: 'Vencendo',
  vencido: 'Vencido',
}

/** 'yyyy-MM-dd' somado de `days` dias, sem passar por fuso. */
function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

/** Primeiro dia em que o vencimento passa a ser avisado. */
export function getContractNoticeDate(
  contract: Pick<Contract, 'end_date' | 'notice_days'>
): string | null {
  return contract.end_date ? addDaysISO(contract.end_date, -contract.notice_days) : null
}

export function getContractSituation(
  contract: Pick<Contract, 'status' | 'end_date' | 'notice_days'>,
  today: string = todayISO()
): ContractSituation {
  if (contract.status !== 'vigente' || !contract.end_date) return contract.status
  if (contract.end_date < today) return 'vencido'
  const noticeDate = getContractNoticeDate(contract)
  return noticeDate !== null && noticeDate <= today ? 'vencendo' : 'vigente'
}

/** O próximo passo natural de cada status — o botão principal do detalhe. */
export const CONTRACT_NEXT_STATUS: Partial<Record<ContractStatus, ContractStatus>> = {
  rascunho: 'aguardando_assinatura',
  aguardando_assinatura: 'vigente',
  vigente: 'encerrado',
}

/** Rótulo do botão que leva a cada status. */
export const CONTRACT_STATUS_ACTION_LABELS: Record<ContractStatus, string> = {
  rascunho: 'Voltar para rascunho',
  aguardando_assinatura: 'Enviar para assinatura',
  vigente: 'Marcar como assinado',
  encerrado: 'Encerrar',
  rescindido: 'Rescindir',
}

// ── Partes (migration 70) ────────────────────────────────────────────────────

/** De onde a parte veio. */
export type ContractPartySource = 'cliente' | 'escritorio' | 'documentos' | 'manual'

export const CONTRACT_PARTY_SOURCE_LABELS: Record<ContractPartySource, string> = {
  cliente: 'Cadastro',
  escritorio: 'Escritório',
  documentos: 'Documentos',
  manual: 'Digitada',
}

/** Endereço da parte — as mesmas partes do endereço do cliente. */
export interface PartyAddress {
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  zip: string | null
}

/** Os dados de pessoa de uma parte — o que a qualificação usa. */
export interface PartyPersonData {
  person_type: ClientType
  name: string | null
  /** CPF ou CNPJ, só dígitos. */
  document: string | null
  rg: string | null
  rg_issuer: string | null
  sex: ClientSex | null
  birth_date: string | null
  nationality: string | null
  marital_status: MaritalStatus | null
  profession: string | null
  address: PartyAddress | null
  email: string | null
  phone: string | null
  representative: string | null
}

/** Dado da parte → documento de onde veio. */
export type PartyFieldSources = Partial<Record<keyof PartyPersonData, string>>

export interface ContractParty extends PartyPersonData {
  id: string
  contract_id: string
  position: number
  role_key: string
  role_label: string
  source: ContractPartySource
  client_id: string | null
  field_sources: PartyFieldSources
  created_at: string
  updated_at: string
}

/** Papéis comuns, oferecidos ao declarar o modelo e ao adicionar uma parte. */
export const PARTY_ROLE_PRESETS: { key: string; label: string }[] = [
  { key: 'contratante', label: 'Contratante' },
  { key: 'contratado', label: 'Contratado' },
  { key: 'locador', label: 'Locador' },
  { key: 'locatario', label: 'Locatário' },
  { key: 'comprador', label: 'Comprador' },
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'fiador', label: 'Fiador' },
  { key: 'conjuge_anuente', label: 'Cônjuge anuente' },
  { key: 'testemunha1', label: 'Testemunha 1' },
  { key: 'testemunha2', label: 'Testemunha 2' },
]

/** O que o leitor reconhece num documento (`documents.source_kind`). */
export const SOURCE_KIND_LABELS = {
  cnh: 'CNH',
  rg: 'RG',
  cpf: 'CPF',
  certidao_nascimento: 'Certidão de nascimento',
  certidao_casamento: 'Certidão de casamento',
  comprovante_residencia: 'Comprovante de residência',
  contrato_social: 'Contrato social',
  cartao_cnpj: 'Cartão CNPJ',
  procuracao: 'Procuração',
  matricula: 'Matrícula do imóvel',
  iptu: 'IPTU',
  crlv: 'CRLV / CRV',
  nota_fiscal: 'Nota fiscal',
  contrato: 'Contrato',
  outro: 'Outro documento',
} as const

export type SourceKind = keyof typeof SOURCE_KIND_LABELS

export const SOURCE_KINDS = Object.keys(SOURCE_KIND_LABELS) as SourceKind[]

export function sourceKindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null
  return kind in SOURCE_KIND_LABELS ? SOURCE_KIND_LABELS[kind as SourceKind] : kind
}

/** O que foi preenchido na última minuta (migration 70). "Gerar nova versão"
 * reabre a tela de geração com isto. */
export interface ContractTemplateValues {
  templateId?: string
  manual?: Record<string, string>
  choices?: Record<string, string[]>
  ai?: Record<string, string>
  overrides?: Record<string, string>
  lawyerIds?: string[]
  /** Campo manual → documento de onde a IA tirou o valor (leitor). */
  manualSources?: Record<string, string>
}

/** Percentual como o contrato o escreve: "20%" ou "12,5%". */
export function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}
