import type {
  ContractKind,
  PartyPersonData,
  SourceKind,
} from '@/types/contract.types'
import type { ManualFieldFormat } from '@/types/documentTemplate.types'

/**
 * O resultado do leitor de documentos, como a rota o devolve e a tela o usa.
 * Só tipos: vale no navegador e no servidor.
 */

/** Origem de um dado que não é documento: a consulta do CNPJ na Receita. */
export const RECEITA_SOURCE = 'receita'

export type PersonFieldKey = Exclude<keyof PartyPersonData, 'person_type'>

/** Um valor possível de um dado, e de onde veio (ids de documento ou
 * `RECEITA_SOURCE`). Mais de uma opção = conflito: a pessoa escolhe. */
export interface FieldOption<T> {
  value: T
  sources: string[]
}

export type PersonFieldOptions = {
  [K in PersonFieldKey]?: FieldOption<NonNullable<PartyPersonData[K]>>[]
}

export interface ReadPerson {
  /** Estável dentro de uma leitura: CPF/CNPJ, ou o nome normalizado. */
  key: string
  personType: PartyPersonData['person_type']
  fields: PersonFieldOptions
  /** Chave do papel que a IA sugeriu, se for um dos papéis oferecidos. */
  suggestedRoleKey: string | null
  documentIds: string[]
  /** Cadastro que já usa este CPF/CNPJ — cliente ou não (migration 78).
   * `isClient` separa quem pode ser o cliente do contrato de quem só tem os
   * dados aproveitados. */
  clientMatch: { id: string; name: string; isClient: boolean } | null
}

export interface ReadDocumentSummary {
  id: string
  name: string
  kind: SourceKind
  summary: string
  illegible: string[]
}

export interface FieldSuggestion {
  field: string
  label: string
  /** Formato do campo manual — decide como o valor lido é guardado. */
  format: ManualFieldFormat
  options: { value: string; sources: string[]; page: string }[]
}

/** Os números de um contrato pronto, lidos na importação. */
export interface ImportedContractData {
  title: string | null
  kind: ContractKind | null
  total_amount: number | null
  installments: number | null
  first_due_date: string | null
  success_fee_percent: number | null
  start_date: string | null
  end_date: string | null
  adjustment_index: string | null
  signed_at: string | null
}

export interface ReaderResult {
  documents: ReadDocumentSummary[]
  persons: ReadPerson[]
  fieldSuggestions: FieldSuggestion[]
  contract: ImportedContractData | null
  /** Documentos que a IA não leu, com o motivo. */
  skipped: string[]
}

export type ReaderMode = 'partes' | 'importar'
