import { formatAddressLine } from '@/features/clientes/utils/qualificacao'
import { parseLooseDate, parseLooseNumber } from '@/features/documentos/templates/spellOut'
import type { ManualFieldDefinition } from '@/features/documentos/templates/fieldSettings'
import type {
  ContractKind,
  PartyAddress,
  PartyPersonData,
  SourceKind,
} from '@/types/contract.types'
import type { MaritalStatus } from '@/types/cliente.types'
import type { ManualFieldFormat } from '@/types/documentTemplate.types'
import type { ReaderContract, ReaderOutput, ReaderPerson } from './readerSchema'
import type {
  FieldOption,
  FieldSuggestion,
  ImportedContractData,
  PersonFieldKey,
  PersonFieldOptions,
  ReadDocumentSummary,
  ReadPerson,
} from './readerTypes'

/**
 * A IA lê, o código junta (docs/contratos.md, "Leitor de documentos").
 *
 * O modelo descreve cada documento separado; aqui as pessoas de vários
 * documentos viram uma só — pelo CPF/CNPJ e, sem ele, pelo nome — e cada dado
 * guarda de quais documentos veio. Dois valores diferentes para o mesmo dado
 * NÃO são resolvidos: viram opções, e quem confere escolhe. Funções puras.
 */

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

function clean(value: string | undefined | null): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed : null
}

/** "Maria  da Silva" e "MARIA DA SILVA" são o mesmo nome. */
export function normalizeName(name: string): string {
  return stripAccents(name).toUpperCase().replace(/\s+/g, ' ').trim()
}

function digits(value: string | null | undefined): string | null {
  const only = value?.replace(/\D/g, '') ?? ''
  return only ? only : null
}

function toIsoDate(value: string | null | undefined): string | null {
  const trimmed = clean(value)
  if (!trimmed) return null
  return parseLooseDate(trimmed)
}

const MARITAL_PATTERNS: [RegExp, MaritalStatus][] = [
  [/^solteir/, 'solteiro'],
  [/^casad/, 'casado'],
  [/^divorciad/, 'divorciado'],
  [/^viuv/, 'viuvo'],
  [/^(uniao|uniao_estavel|convivente|companheir)/, 'uniao_estavel'],
  [/^separad/, 'separado'],
]

function toMaritalStatus(value: string | null | undefined): MaritalStatus | null {
  const normalized = stripAccents(clean(value) ?? '').toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return null
  return MARITAL_PATTERNS.find(([pattern]) => pattern.test(normalized))?.[1] ?? null
}

function toAddress(person: ReaderPerson): PartyAddress | null {
  const address: PartyAddress = {
    street: clean(person.logradouro),
    number: clean(person.numero),
    complement: clean(person.complemento),
    neighborhood: clean(person.bairro),
    city: clean(person.cidade),
    state: clean(person.uf)?.toUpperCase().slice(0, 2) ?? null,
    zip: clean(person.cep),
  }
  // Só cidade ou só CEP não é endereço que sirva a uma qualificação.
  return address.street || (address.city && address.zip) ? address : null
}

/** O que a IA leu de uma pessoa, no formato da parte. */
export function personDataFromReader(person: ReaderPerson): Omit<PartyPersonData, 'person_type'> {
  const isCompany = person.tipo_pessoa === 'juridica'
  const sex = clean(person.sexo)?.toLowerCase()
  return {
    name: clean(person.nome),
    document: (() => {
      const only = digits(person.cpf_cnpj)
      return only && (only.length === 11 || only.length === 14) ? only : null
    })(),
    rg: isCompany ? null : clean(person.rg),
    rg_issuer: isCompany ? null : (clean(person.rg_orgao)?.toUpperCase() ?? null),
    sex: isCompany ? null : sex === 'masculino' || sex === 'feminino' ? sex : null,
    birth_date: isCompany ? null : toIsoDate(person.nascimento),
    nationality: isCompany ? null : (clean(person.nacionalidade)?.toLowerCase() ?? null),
    marital_status: isCompany ? null : toMaritalStatus(person.estado_civil),
    profession: isCompany ? null : clean(person.profissao),
    address: toAddress(person),
    email: clean(person.email)?.toLowerCase() ?? null,
    phone: clean(person.telefone),
    representative: isCompany ? clean(person.representante) : null,
  }
}

/** Chave de comparação: dois valores com a mesma chave são o mesmo dado. */
export function comparisonKey(field: PersonFieldKey, value: unknown): string {
  if (field === 'address') return normalizeName(formatAddressLine(value as PartyAddress))
  if (field === 'document' || field === 'phone') return digits(String(value)) ?? ''
  if (field === 'rg') return String(value).toUpperCase().replace(/[^0-9A-Z]/g, '')
  return normalizeName(String(value))
}

/** Acrescenta um valor às opções de um dado: junta à opção igual, ou abre
 * outra — que é um conflito. */
export function addOption<K extends PersonFieldKey>(
  fields: PersonFieldOptions,
  field: K,
  value: PartyPersonData[K] | null | undefined,
  source: string,
): void {
  if (value === null || value === undefined || value === '') return
  const options = (fields[field] ?? []) as FieldOption<NonNullable<PartyPersonData[K]>>[]
  const key = comparisonKey(field, value)
  const same = options.find((option) => comparisonKey(field, option.value) === key)
  if (same) {
    if (!same.sources.includes(source)) same.sources.push(source)
  } else {
    options.push({ value: value as NonNullable<PartyPersonData[K]>, sources: [source] })
  }
  fields[field] = options as PersonFieldOptions[K]
}

const PERSON_FIELDS: PersonFieldKey[] = [
  'name',
  'document',
  'rg',
  'rg_issuer',
  'sex',
  'birth_date',
  'nationality',
  'marital_status',
  'profession',
  'address',
  'email',
  'phone',
  'representative',
]

interface Mention {
  documentId: string
  personType: PartyPersonData['person_type']
  data: Omit<PartyPersonData, 'person_type'>
  role: string
}

/** O nome mais citado de uma pessoa — é por ele que outras menções sem
 * CPF se juntam a ela. */
function mainName(person: ReadPerson): string | null {
  const names = person.fields.name ?? []
  const top = [...names].sort((a, b) => b.sources.length - a.sources.length)[0]
  return top ? normalizeName(top.value) : null
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * As pessoas de todos os documentos, juntas.
 *
 * Duas passadas: primeiro quem tem CPF/CNPJ, agrupado por ele; depois quem não
 * tem (um comprovante de residência traz só o nome) entra no grupo de mesmo
 * nome, ou forma um grupo próprio.
 */
export function mergePersons(
  output: ReaderOutput,
  documentIdByIndex: ReadonlyMap<number, string>,
  roleKeys: readonly string[],
): ReadPerson[] {
  const mentions: Mention[] = []
  for (const document of output.documentos) {
    const documentId = documentIdByIndex.get(document.indice)
    if (!documentId) continue
    for (const person of document.pessoas) {
      const data = personDataFromReader(person)
      if (!data.name && !data.document) continue
      mentions.push({
        documentId,
        personType: person.tipo_pessoa === 'juridica' ? 'company' : 'individual',
        data,
        role: clean(person.papel_sugerido)?.toLowerCase() ?? '',
      })
    }
  }

  const persons: ReadPerson[] = []
  const roles: Map<ReadPerson, string[]> = new Map()

  function absorb(person: ReadPerson, mention: Mention) {
    for (const field of PERSON_FIELDS) {
      addOption(person.fields, field, mention.data[field], mention.documentId)
    }
    if (!person.documentIds.includes(mention.documentId)) person.documentIds.push(mention.documentId)
    if (mention.role) roles.set(person, [...(roles.get(person) ?? []), mention.role])
  }

  function create(key: string, mention: Mention): ReadPerson {
    const person: ReadPerson = {
      key,
      personType: mention.personType,
      fields: {},
      suggestedRoleKey: null,
      documentIds: [],
      clientMatch: null,
    }
    persons.push(person)
    return person
  }

  for (const mention of mentions.filter((item) => item.data.document)) {
    const key = mention.data.document as string
    const person = persons.find((item) => item.key === key) ?? create(key, mention)
    absorb(person, mention)
  }

  for (const mention of mentions.filter((item) => !item.data.document)) {
    const name = mention.data.name ? normalizeName(mention.data.name) : null
    if (!name) continue
    const person =
      persons.find((item) => mainName(item) === name) ?? create(`nome:${name}`, mention)
    absorb(person, mention)
  }

  for (const person of persons) {
    const suggested = mostCommon(roles.get(person) ?? [])
    person.suggestedRoleKey = suggested && roleKeys.includes(suggested) ? suggested : null
  }
  return persons
}

export function summarizeDocuments(
  output: ReaderOutput,
  documents: readonly { id: string; file_name: string }[],
  documentIdByIndex: ReadonlyMap<number, string>,
): ReadDocumentSummary[] {
  return documents.map((document) => {
    const index = [...documentIdByIndex.entries()].find(([, id]) => id === document.id)?.[0]
    const read = output.documentos.find((item) => item.indice === index)
    return {
      id: document.id,
      name: document.file_name,
      kind: (read?.tipo ?? 'outro') as SourceKind,
      summary: clean(read?.resumo) ?? document.file_name,
      illegible: (read?.ilegivel ?? []).map((item) => item.trim()).filter(Boolean),
    }
  })
}

/** Valores sugeridos para os campos manuais do modelo, com a origem. */
export function mergeFieldSuggestions(
  output: ReaderOutput,
  documentIdByIndex: ReadonlyMap<number, string>,
  manualFields: readonly Pick<ManualFieldDefinition, 'name' | 'label' | 'format'>[],
): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = []
  for (const document of output.documentos) {
    const documentId = documentIdByIndex.get(document.indice)
    if (!documentId) continue
    for (const item of document.campos_do_modelo) {
      const name = item.campo.replace(/[{}]/g, '').trim()
      const field = manualFields.find((definition) => definition.name === name)
      const value = clean(item.valor)
      if (!field || !value) continue
      const suggestion =
        suggestions.find((entry) => entry.field === name) ??
        (() => {
          const created: FieldSuggestion = {
            field: name,
            label: field.label,
            format: field.format,
            options: [],
          }
          suggestions.push(created)
          return created
        })()
      const key = normalizeName(value)
      const same = suggestion.options.find((option) => normalizeName(option.value) === key)
      if (same) {
        if (!same.sources.includes(documentId)) same.sources.push(documentId)
      } else {
        suggestion.options.push({ value, sources: [documentId], page: clean(item.pagina) ?? '' })
      }
    }
  }
  return suggestions
}

/**
 * O valor lido como a tela de geração guarda um campo manual: número com
 * ponto decimal, data 'yyyy-MM-dd', texto como está. O que não converte fica
 * como foi lido — quem gera vê e corrige.
 */
export function toManualRawValue(format: ManualFieldFormat, value: string): string {
  if (format === 'currency' || format === 'number' || format === 'percent') {
    const number = parseLooseNumber(value)
    return number === null ? value : String(number)
  }
  if (format === 'date') return parseLooseDate(value) ?? value
  return value
}

const CONTRACT_KINDS: ContractKind[] = ['honorarios', 'cliente_terceiros', 'escritorio']

function toNumber(value: string): number | null {
  const trimmed = clean(value)
  if (!trimmed) return null
  return parseLooseNumber(trimmed)
}

/** Os números do contrato importado. O que não é número ou data válida fica
 * em branco, para quem confere preencher. */
export function contractDataFromReader(contract: ReaderContract): ImportedContractData {
  const installments = toNumber(contract.parcelas)
  const fee = toNumber(contract.exito_percentual)
  const kind = clean(contract.tipo) as ContractKind | null
  return {
    title: clean(contract.titulo),
    kind: kind && CONTRACT_KINDS.includes(kind) ? kind : null,
    total_amount: toNumber(contract.valor_total),
    installments:
      installments !== null && Number.isInteger(installments) && installments >= 1
        ? installments
        : null,
    first_due_date: toIsoDate(contract.primeiro_vencimento),
    success_fee_percent: fee !== null && fee >= 0 && fee <= 100 ? fee : null,
    start_date: toIsoDate(contract.inicio),
    end_date: toIsoDate(contract.fim),
    adjustment_index: clean(contract.reajuste),
    signed_at: toIsoDate(contract.assinado_em),
  }
}
