import type { ClientWithRelations, MaritalStatus, ClientSex } from '@/types/cliente.types'
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

/** Endereço numa linha só, pulando o que estiver vazio. */
function buildAddress(client: Pick<
  ClientWithRelations,
  | 'address_street'
  | 'address_number'
  | 'address_complement'
  | 'address_neighborhood'
  | 'address_city'
  | 'address_state'
  | 'address_zip'
>): string {
  const street = [client.address_street, client.address_number].filter(Boolean).join(', nº ')
  const parts = [
    street,
    client.address_complement,
    client.address_neighborhood,
    [client.address_city, client.address_state].filter(Boolean).join('/'),
    client.address_zip ? `CEP ${client.address_zip}` : null,
  ]
  return parts.filter((p) => p && p.trim()).join(', ')
}

/**
 * Parágrafo de qualificação, pronto para colar numa petição.
 *
 * Cada trecho só entra se o campo correspondente existir — um cadastro com nome
 * e CPF gera uma frase curta e correta, não uma com lacunas. Devolve string
 * vazia quando não há nem nome.
 */
export function buildQualificacao(client: ClientWithRelations): string {
  return client.type === 'company' ? buildCompany(client) : buildIndividual(client)
}

function buildIndividual(client: ClientWithRelations): string {
  const name = client.name?.trim()
  if (!name) return ''

  const sex = client.sex ?? null
  const parts: string[] = []

  if (client.nationality?.trim()) parts.push(client.nationality.trim())

  if (client.marital_status) {
    parts.push(MARITAL_STATUS_FORMS[client.marital_status][sex === 'feminino' ? 'f' : 'm'])
  }

  if (client.profession?.trim()) parts.push(client.profession.trim())

  if (client.rg?.trim()) {
    const issuer = client.rg_issuer?.trim()
    parts.push(
      `${agree(sex, 'portador', 'portadora')} do RG nº ${client.rg.trim()}${issuer ? ` ${issuer}` : ''}`
    )
  }

  if (client.cpf?.trim()) {
    parts.push(
      `${agree(sex, 'inscrito', 'inscrita')} no CPF sob o nº ${formatDocument(client.cpf.trim())}`
    )
  }

  if (client.birth_date) {
    parts.push(`${agree(sex, 'nascido', 'nascida')} em ${formatBrDate(client.birth_date)}`)
  }

  const address = buildAddress(client)
  if (address) {
    parts.push(`${agree(sex, 'residente e domiciliado', 'residente e domiciliada')} na ${address}`)
  }

  return parts.length === 0 ? name : `${name}, ${parts.join(', ')}`
}

function buildCompany(client: ClientWithRelations): string {
  const name = client.company_name?.trim()
  if (!name) return ''

  const parts: string[] = ['pessoa jurídica de direito privado']

  if (client.cnpj?.trim()) {
    parts.push(`inscrita no CNPJ sob o nº ${formatDocument(client.cnpj.trim())}`)
  }

  const address = buildAddress(client)
  if (address) parts.push(`com sede na ${address}`)

  if (client.contact_person?.trim()) {
    parts.push(`neste ato representada por ${client.contact_person.trim()}`)
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
