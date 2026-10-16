import { formatAddressLine } from '@/features/clientes/utils/qualificacao'
import { MARITAL_STATUS_LABELS, SEX_LABELS } from '@/types/cliente.types'
import type {
  ContractParty,
  PartyAddress,
  PartyFieldSources,
  PartyPersonData,
} from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { formatDate } from '@/utils/date'
import { formatDocument } from '@/utils/format'
import {
  RECEITA_SOURCE,
  type PersonFieldKey,
  type ReaderResult,
  type ReadPerson,
} from './readerTypes'

/**
 * O que quem confere decide sobre o resultado do leitor — e como isso vira
 * parte do contrato. Funções puras: a tela guarda o estado, isto o interpreta.
 */

export const PERSON_FIELD_LABELS: Record<PersonFieldKey, string> = {
  name: 'Nome',
  document: 'CPF/CNPJ',
  rg: 'RG',
  rg_issuer: 'Órgão emissor',
  sex: 'Sexo',
  birth_date: 'Nascimento',
  nationality: 'Nacionalidade',
  marital_status: 'Estado civil',
  profession: 'Profissão',
  address: 'Endereço',
  email: 'E-mail',
  phone: 'Telefone',
  representative: 'Representante',
}

export const PERSON_FIELD_ORDER = Object.keys(PERSON_FIELD_LABELS) as PersonFieldKey[]

export function formatPersonField(field: PersonFieldKey, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (field) {
    case 'address':
      return formatAddressLine(value as PartyAddress) || '—'
    case 'document':
      return formatDocument(String(value))
    case 'birth_date':
      return formatDate(String(value))
    case 'marital_status':
      return MARITAL_STATUS_LABELS[value as keyof typeof MARITAL_STATUS_LABELS] ?? String(value)
    case 'sex':
      return SEX_LABELS[value as keyof typeof SEX_LABELS] ?? String(value)
    default:
      return String(value)
  }
}

export interface PersonDecision {
  include: boolean
  role: TemplatePartyRole | null
  /** Com cliente já cadastrado: usar o cadastro (e completar com o lido). */
  useClient: boolean
  /** Índice da opção escolhida em cada dado com conflito. */
  choices: Partial<Record<PersonFieldKey, number>>
}

export interface ReviewState {
  persons: Record<string, PersonDecision>
  /** Documento lido → fica nos arquivos do contrato. */
  keepDocuments: Record<string, boolean>
  /** Campo do modelo → usar a sugestão, e qual opção. */
  suggestions: Record<string, { use: boolean; option: number }>
}

/**
 * O ponto de partida: todo mundo incluído, menos quem já é parte do contrato
 * pelo mesmo CPF/CNPJ; o papel que a IA sugeriu ou o primeiro papel do modelo
 * que ainda está sem parte; o cadastro, quando existe; a primeira opção de
 * cada conflito; os documentos guardados.
 */
export function initialReviewState(
  result: ReaderResult,
  roles: readonly TemplatePartyRole[],
  templateRoles: readonly TemplatePartyRole[],
  existingParties: readonly Pick<ContractParty, 'document' | 'role_key'>[],
): ReviewState {
  const takenRoles = new Set(existingParties.map((party) => party.role_key))
  const persons: Record<string, PersonDecision> = {}
  for (const person of result.persons) {
    const document = person.fields.document?.[0]?.value
    const alreadyParty = !!document && existingParties.some((party) => party.document === document)
    const suggested = roles.find((role) => role.key === person.suggestedRoleKey) ?? null
    const fallback = templateRoles.find((role) => !takenRoles.has(role.key)) ?? null
    const role = suggested ?? fallback
    if (role) takenRoles.add(role.key)
    persons[person.key] = {
      include: !alreadyParty,
      role,
      useClient: !!person.clientMatch,
      choices: {},
    }
  }
  return {
    persons,
    keepDocuments: Object.fromEntries(result.documents.map((document) => [document.id, true])),
    suggestions: Object.fromEntries(
      result.fieldSuggestions.map((suggestion) => [suggestion.field, { use: true, option: 0 }]),
    ),
  }
}

/** Dados com mais de uma opção — os que a pessoa precisa olhar. */
export function conflictingFields(person: ReadPerson): PersonFieldKey[] {
  return PERSON_FIELD_ORDER.filter((field) => (person.fields[field]?.length ?? 0) > 1)
}

/** Os dados escolhidos da pessoa lida, e de onde veio cada um. */
export function chosenPersonData(
  person: ReadPerson,
  decision: PersonDecision,
): { person: PartyPersonData; sources: PartyFieldSources } {
  const data: PartyPersonData = {
    person_type: person.personType,
    name: null,
    document: null,
    rg: null,
    rg_issuer: null,
    sex: null,
    birth_date: null,
    nationality: null,
    marital_status: null,
    profession: null,
    address: null,
    email: null,
    phone: null,
    representative: null,
  }
  const sources: PartyFieldSources = {}
  for (const field of PERSON_FIELD_ORDER) {
    const options = person.fields[field]
    if (!options || options.length === 0) continue
    const chosen = options[decision.choices[field] ?? 0] ?? options[0]
    ;(data as unknown as Record<string, unknown>)[field] = chosen.value
    // Um documento de verdade vale mais como origem que a consulta à Receita.
    sources[field] = chosen.sources.find((source) => source !== RECEITA_SOURCE) ?? chosen.sources[0]
  }
  return { person: data, sources }
}

/**
 * O cadastro do cliente completado com o que foi lido: dado que o cadastro tem
 * fica como está (é dele que o contrato parte); só os buracos recebem o lido,
 * com a origem anotada.
 */
export function fillFromReading(
  fromClient: PartyPersonData,
  read: { person: PartyPersonData; sources: PartyFieldSources },
): { person: PartyPersonData; sources: PartyFieldSources } {
  const person = { ...fromClient }
  const sources: PartyFieldSources = {}
  for (const field of PERSON_FIELD_ORDER) {
    if (person[field] !== null && person[field] !== undefined) continue
    const value = read.person[field]
    if (value === null || value === undefined) continue
    ;(person as unknown as Record<string, unknown>)[field] = value
    if (read.sources[field]) sources[field] = read.sources[field]
  }
  return { person, sources }
}
