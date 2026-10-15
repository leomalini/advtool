import {
  buildPersonQualificacao,
  formatAddressLine,
  formatMaritalStatus,
} from '@/features/clientes/utils/qualificacao'
import type { ContractParty, PartyPersonData } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { formatDocument } from '@/utils/format'
import { formatShortDate } from './spellOut'
import { joinNames } from './text'

/**
 * Campos de PARTE dos modelos de contrato (migration 70).
 *
 * O modelo declara papéis — "Locatário", chave `locatario` — e cada papel
 * ganha os mesmos campos do cliente: `{locatario_nome}`,
 * `{locatario_qualificacao}`… Quem preenche são as partes do contrato que têm
 * aquele papel, nunca quem gera nem a IA. Só dados declarativos e funções
 * puras aqui: roda na tela e no servidor.
 */

/** Os sufixos — os mesmos do grupo `cliente` do catálogo, na mesma ordem. */
export const PARTY_FIELD_SUFFIXES = [
  { suffix: 'nome', description: 'Nome completo ou razão social' },
  { suffix: 'qualificacao', description: 'Qualificação completa' },
  { suffix: 'documento', description: 'CPF ou CNPJ, formatado' },
  { suffix: 'rg', description: 'RG com o órgão emissor' },
  { suffix: 'estado_civil', description: 'Estado civil, no gênero da pessoa' },
  { suffix: 'profissao', description: 'Profissão' },
  { suffix: 'nacionalidade', description: 'Nacionalidade' },
  { suffix: 'nascimento', description: 'Data de nascimento (dd/mm/aaaa)' },
  { suffix: 'email', description: 'E-mail' },
  { suffix: 'telefone', description: 'Telefone' },
  { suffix: 'endereco', description: 'Endereço, numa linha' },
  { suffix: 'cidade', description: 'Cidade do endereço' },
  { suffix: 'uf', description: 'UF do endereço' },
  { suffix: 'cep', description: 'CEP do endereço' },
  { suffix: 'representante', description: 'Quem representa a pessoa jurídica' },
] as const

export type PartyFieldSuffix = (typeof PARTY_FIELD_SUFFIXES)[number]['suffix']

const SUFFIX_DESCRIPTIONS: ReadonlyMap<string, string> = new Map(
  PARTY_FIELD_SUFFIXES.map((item) => [item.suffix, item.description]),
)

/** Um campo de parte usado pelo modelo. */
export interface PartyFieldUse {
  /** Nome no .docx, sem chaves: `locatario_nome`. */
  name: string
  role: TemplatePartyRole
  suffix: PartyFieldSuffix
}

/** "Promitente comprador" → "promitente_comprador": a chave que vira prefixo
 * dos campos no .docx. */
export function roleKeyFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'p$1')
}

export function partyFieldName(roleKey: string, suffix: PartyFieldSuffix): string {
  return `${roleKey}_${suffix}`
}

/** "Locatário — Qualificação completa", para a tela de geração. */
export function describePartyField(use: PartyFieldUse): string {
  return `${use.role.label} — ${SUFFIX_DESCRIPTIONS.get(use.suffix) ?? use.suffix}`
}

/**
 * O papel e o sufixo de um campo, se ele for de parte. A chave mais longa é
 * conferida primeiro: com os papéis `conjuge` e `conjuge_anuente`,
 * `{conjuge_anuente_nome}` é do segundo.
 */
export function matchPartyField(
  field: string,
  roles: readonly TemplatePartyRole[],
): PartyFieldUse | null {
  const byLength = [...roles].sort((a, b) => b.key.length - a.key.length)
  for (const role of byLength) {
    if (!field.startsWith(`${role.key}_`)) continue
    const suffix = field.slice(role.key.length + 1)
    if (SUFFIX_DESCRIPTIONS.has(suffix)) {
      return { name: field, role, suffix: suffix as PartyFieldSuffix }
    }
  }
  return null
}

/** Só os papéis que o arquivo usa — trocar o .docx não deixa papel órfão,
 * como `settingsForFields` faz com as definições. */
export function rolesInUse(
  fields: readonly string[],
  roles: readonly TemplatePartyRole[],
): TemplatePartyRole[] {
  return roles.filter((role) =>
    fields.some((field) => matchPartyField(field, [role]) !== null),
  )
}

/** Prefixos que já têm dono no catálogo — nunca viram papel. */
const RESERVED_PREFIXES = new Set([
  'cliente',
  'processo',
  'contrato',
  'advogado',
  'advogados',
  'escritorio',
  'data',
  'local',
  'parte',
])

/**
 * Papéis que o arquivo parece usar e o modelo ainda não declarou: prefixos com
 * `_nome` ou `_qualificacao`, ou com dois sufixos de parte diferentes.
 *
 * Só uma sugestão — `{imovel_endereco}` termina como campo de parte e é do
 * objeto do contrato. Por isso o papel é declarado, não deduzido.
 */
export function suggestPartyRoles(
  fields: readonly string[],
  declared: readonly TemplatePartyRole[],
  labelOf: (key: string) => string,
): TemplatePartyRole[] {
  const suffixesByPrefix = new Map<string, Set<string>>()
  for (const field of fields) {
    for (const { suffix } of PARTY_FIELD_SUFFIXES) {
      if (!field.endsWith(`_${suffix}`)) continue
      const prefix = field.slice(0, -(suffix.length + 1))
      if (!/^[a-z][a-z0-9_]*$/.test(prefix) || RESERVED_PREFIXES.has(prefix)) continue
      const set = suffixesByPrefix.get(prefix) ?? new Set<string>()
      set.add(suffix)
      suffixesByPrefix.set(prefix, set)
    }
  }

  const suggestions: TemplatePartyRole[] = []
  for (const [prefix, suffixes] of suffixesByPrefix) {
    if (declared.some((role) => role.key === prefix)) continue
    const strong = suffixes.has('nome') || suffixes.has('qualificacao')
    if (strong || suffixes.size >= 2) suggestions.push({ key: prefix, label: labelOf(prefix) })
  }
  return suggestions
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** O valor de cada sufixo para uma pessoa. */
export function personFieldValues(
  person: PartyPersonData,
): Record<PartyFieldSuffix, string | undefined> {
  const isCompany = person.person_type === 'company'
  const rg = nonEmpty(person.rg)
  return {
    nome: nonEmpty(person.name),
    qualificacao: nonEmpty(
      buildPersonQualificacao({
        type: person.person_type,
        name: person.name,
        document: person.document,
        rg: person.rg,
        rg_issuer: person.rg_issuer,
        sex: person.sex,
        birth_date: person.birth_date,
        nationality: person.nationality,
        marital_status: person.marital_status,
        profession: person.profession,
        address: person.address,
        representative: person.representative,
      }),
    ),
    documento: person.document ? formatDocument(person.document) : undefined,
    rg: rg ? [rg, nonEmpty(person.rg_issuer)].filter(Boolean).join(' ') : undefined,
    estado_civil: isCompany ? undefined : (formatMaritalStatus(person) ?? undefined),
    profissao: isCompany ? undefined : nonEmpty(person.profession),
    nacionalidade: isCompany ? undefined : nonEmpty(person.nationality),
    nascimento:
      !isCompany && person.birth_date
        ? (formatShortDate(person.birth_date) ?? undefined)
        : undefined,
    email: nonEmpty(person.email),
    telefone: nonEmpty(person.phone),
    endereco: nonEmpty(formatAddressLine(person.address)),
    cidade: nonEmpty(person.address?.city),
    uf: nonEmpty(person.address?.state)?.toUpperCase(),
    cep: nonEmpty(person.address?.zip),
    representante: isCompany ? nonEmpty(person.representative) : undefined,
  }
}

/** Vários valores do mesmo papel num campo só. A qualificação já tem
 * vírgulas dentro, então as pessoas se separam por ponto e vírgula. */
function combine(suffix: PartyFieldSuffix, values: string[]): string | undefined {
  if (values.length === 0) return undefined
  if (values.length === 1) return values[0]
  if (suffix === 'qualificacao') {
    return `${values.slice(0, -1).join('; ')}; e ${values[values.length - 1]}`
  }
  return joinNames(values)
}

/**
 * Valores dos campos de parte que o modelo usa. Duas partes com o mesmo papel
 * (dois locatários) entram juntas, na ordem do contrato; papel sem parte fica
 * `undefined` e sai `[FALTA: campo]`.
 */
export function partyValues(
  uses: readonly PartyFieldUse[],
  parties: readonly ContractParty[],
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {}
  const ordered = [...parties].sort((a, b) => a.position - b.position)
  for (const use of uses) {
    const fromRole = ordered
      .filter((party) => party.role_key === use.role.key)
      .map((party) => personFieldValues(party)[use.suffix])
      .filter((value): value is string => !!value)
    values[use.name] = combine(use.suffix, fromRole)
  }
  return values
}

/** Papéis que o modelo usa e o contrato ainda não tem — para avisar antes de
 * gerar. */
export function rolesWithoutParty(
  uses: readonly PartyFieldUse[],
  parties: readonly Pick<ContractParty, 'role_key'>[],
): TemplatePartyRole[] {
  const missing: TemplatePartyRole[] = []
  for (const use of uses) {
    if (parties.some((party) => party.role_key === use.role.key)) continue
    if (!missing.some((role) => role.key === use.role.key)) missing.push(use.role)
  }
  return missing
}
