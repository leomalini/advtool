import type {
  ClientAddress,
  ClientWithRelations,
  ClientType,
  MaritalStatus,
  ClientSex,
} from '@/types/cliente.types'
import { formatDocument } from '@/utils/format'

/**
 * Estado civil nas duas concordâncias.
 *
 * A qualificação é copiada direto para a petição, então "casado" numa cliente
 * mulher é erro que vai para os autos. União estável não flexiona.
 */
const MARITAL_STATUS_FORMS: Record<MaritalStatus, { m: string; f: string }> = {
  solteiro: { m: 'solteiro', f: 'solteira' },
  casado: { m: 'casado', f: 'casada' },
  divorciado: { m: 'divorciado', f: 'divorciada' },
  viuvo: { m: 'viúvo', f: 'viúva' },
  separado: { m: 'separado', f: 'separada' },
  uniao_estavel: { m: 'em união estável', f: 'em união estável' },
}

/** "portador"/"portadora", "inscrito"/"inscrita", "residente e domiciliado"… */
function agree(sex: ClientSex | null, masculine: string, feminine: string): string {
  return sex === 'feminino' ? feminine : masculine
}

/** Estado civil no gênero do cliente ("casada"), ou null sem cadastro. */
export function formatMaritalStatus(client: {
  marital_status: MaritalStatus | null
  sex?: ClientSex | null
}): string | null {
  if (!client.marital_status) return null
  return MARITAL_STATUS_FORMS[client.marital_status][client.sex === 'feminino' ? 'f' : 'm']
}

/**
 * O endereço que vai para a petição.
 *
 * O marcado como principal; na falta dele, o primeiro da lista — cadastro
 * vindo de importação pode não ter marcação, e é melhor uma qualificação com
 * o endereço provável do que uma sem endereço nenhum.
 */
export function getPrimaryAddress(
  client: Pick<ClientWithRelations, 'addresses'>
): ClientAddress | null {
  const addresses = client.addresses ?? []
  return addresses.find((a) => a.is_primary) ?? addresses[0] ?? null
}

/** Partes de endereço que a linha usa — as mesmas no cliente e no escritório. */
export type AddressLineParts = Pick<
  ClientAddress,
  'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'state' | 'zip'
>

/** Endereço numa linha só, pulando o que estiver vazio. */
export function formatAddressLine(address: AddressLineParts | null): string {
  if (!address) return ''

  const street = [address.street, address.number].filter(Boolean).join(', nº ')
  const parts = [
    street,
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join('/'),
    address.zip ? `CEP ${address.zip}` : null,
  ]
  return parts.filter((p) => p && p.trim()).join(', ')
}

/**
 * O que a qualificação lê de uma pessoa. Serve ao cliente e à parte de um
 * contrato (migration 70), que não tem o formato do cadastro.
 */
export interface QualificationPerson {
  type: ClientType
  /** Nome (PF) ou razão social (PJ). */
  name: string | null
  /** CPF (PF) ou CNPJ (PJ). */
  document: string | null
  rg: string | null
  rg_issuer: string | null
  sex: ClientSex | null
  birth_date: string | null
  nationality: string | null
  marital_status: MaritalStatus | null
  profession: string | null
  address: AddressLineParts | null
  /** Quem assina pela pessoa jurídica. */
  representative: string | null
}

function clientToPerson(client: ClientWithRelations): QualificationPerson {
  const isCompany = client.type === 'company'
  return {
    type: client.type,
    name: isCompany ? client.company_name : client.name,
    document: isCompany ? client.cnpj : client.cpf,
    rg: client.rg,
    rg_issuer: client.rg_issuer,
    sex: client.sex ?? null,
    birth_date: client.birth_date,
    nationality: client.nationality,
    marital_status: client.marital_status,
    profession: client.profession,
    address: getPrimaryAddress(client),
    representative: isCompany ? client.contact_person : null,
  }
}

/**
 * Parágrafo de qualificação, pronto para colar numa petição.
 *
 * Cada trecho só entra se o campo correspondente existir — um cadastro com nome
 * e CPF gera uma frase curta e correta, não uma com lacunas. Devolve string
 * vazia quando não há nem nome.
 */
export function buildQualificacao(client: ClientWithRelations): string {
  return buildPersonQualificacao(clientToPerson(client))
}

/** A mesma qualificação, para quem não é cliente — a parte de um contrato. */
export function buildPersonQualificacao(person: QualificationPerson): string {
  return person.type === 'company' ? buildCompany(person) : buildIndividual(person)
}

function buildIndividual(person: QualificationPerson): string {
  const name = person.name?.trim()
  if (!name) return ''

  const sex = person.sex
  const parts: string[] = []

  if (person.nationality?.trim()) parts.push(person.nationality.trim())

  const maritalStatus = formatMaritalStatus(person)
  if (maritalStatus) parts.push(maritalStatus)

  if (person.profession?.trim()) parts.push(person.profession.trim())

  if (person.rg?.trim()) {
    const issuer = person.rg_issuer?.trim()
    parts.push(
      `${agree(sex, 'portador', 'portadora')} do RG nº ${person.rg.trim()}${issuer ? ` ${issuer}` : ''}`
    )
  }

  if (person.document?.trim()) {
    parts.push(
      `${agree(sex, 'inscrito', 'inscrita')} no CPF sob o nº ${formatDocument(person.document.trim())}`
    )
  }

  if (person.birth_date) {
    parts.push(`${agree(sex, 'nascido', 'nascida')} em ${formatBrDate(person.birth_date)}`)
  }

  const address = formatAddressLine(person.address)
  if (address) {
    parts.push(`${agree(sex, 'residente e domiciliado', 'residente e domiciliada')} na ${address}`)
  }

  return parts.length === 0 ? name : `${name}, ${parts.join(', ')}`
}

function buildCompany(person: QualificationPerson): string {
  const name = person.name?.trim()
  if (!name) return ''

  const parts: string[] = ['pessoa jurídica de direito privado']

  if (person.document?.trim()) {
    parts.push(`inscrita no CNPJ sob o nº ${formatDocument(person.document.trim())}`)
  }

  const address = formatAddressLine(person.address)
  if (address) parts.push(`com sede na ${address}`)

  if (person.representative?.trim()) {
    parts.push(`neste ato representada por ${person.representative.trim()}`)
  }

  return `${name}, ${parts.join(', ')}`
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' sem passar por Date, que aplicaria fuso e
 * poderia devolver o dia anterior. */
function formatBrDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Idade em anos completos na data de hoje. Null quando não há nascimento. */
export function getClientAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null

  const today = new Date()
  let age = today.getFullYear() - year
  // Ainda não fez aniversário este ano.
  const monthDiff = today.getMonth() + 1 - month
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age -= 1

  return age >= 0 ? age : null
}
