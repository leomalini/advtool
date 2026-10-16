import { getPrimaryAddress } from '@/features/clientes/utils/qualificacao'
import type { ContractPartyInput } from '@/schemas/contract.schema'
import type { ClientWithRelations } from '@/types/cliente.types'
import type {
  ContractParty,
  PartyAddress,
  PartyPersonData,
} from '@/types/contract.types'
import type { OfficeSettings } from '@/types/officeSettings.types'
import { formatDocument } from '@/utils/format'

/**
 * Conversões entre os dados de pessoa de uma parte (migration 70) e o que já
 * existe: o cadastro do cliente, os dados do escritório e o formulário.
 */

function digitsOrNull(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? ''
  return digits ? digits : null
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function addressOrNull(address: Partial<PartyAddress> | null | undefined): PartyAddress | null {
  if (!address) return null
  const normalized: PartyAddress = {
    street: textOrNull(address.street),
    number: textOrNull(address.number),
    complement: textOrNull(address.complement),
    neighborhood: textOrNull(address.neighborhood),
    city: textOrNull(address.city),
    state: textOrNull(address.state)?.toUpperCase() ?? null,
    zip: textOrNull(address.zip),
  }
  return Object.values(normalized).some(Boolean) ? normalized : null
}

/** Contato principal; na falta de um marcado, o primeiro; na falta de
 * contatos, as colunas antigas — mesmo critério dos campos `{cliente_*}`. */
function primaryContact(client: ClientWithRelations, type: 'email' | 'phone'): string | null {
  const contacts = (client.contacts ?? []).filter(
    (contact) => contact.type === type && contact.value.trim(),
  )
  const contact = contacts.find((item) => item.is_primary) ?? contacts[0]
  return textOrNull(contact?.value) ?? textOrNull(type === 'email' ? client.email : client.phone)
}

/** A cópia do cadastro que vira parte (ou atualiza uma parte do cadastro). */
export function personFromClient(client: ClientWithRelations): PartyPersonData {
  const isCompany = client.type === 'company'
  return {
    person_type: client.type,
    name: textOrNull(isCompany ? client.company_name : client.name),
    document: digitsOrNull(isCompany ? client.cnpj : client.cpf),
    rg: isCompany ? null : textOrNull(client.rg),
    rg_issuer: isCompany ? null : textOrNull(client.rg_issuer),
    sex: isCompany ? null : (client.sex ?? null),
    birth_date: isCompany ? null : client.birth_date,
    nationality: isCompany ? null : textOrNull(client.nationality),
    marital_status: isCompany ? null : client.marital_status,
    profession: isCompany ? null : textOrNull(client.profession),
    address: addressOrNull(getPrimaryAddress(client)),
    email: primaryContact(client, 'email'),
    phone: primaryContact(client, 'phone'),
    representative: isCompany ? textOrNull(client.contact_person) : null,
  }
}

/** O escritório como parte — o "Contratado" dos honorários. Quem assina por
 * ele fica para quem gera completar. */
export function personFromOffice(office: OfficeSettings): PartyPersonData {
  return {
    person_type: 'company',
    name: textOrNull(office.name),
    document: digitsOrNull(office.cnpj),
    rg: null,
    rg_issuer: null,
    sex: null,
    birth_date: null,
    nationality: null,
    marital_status: null,
    profession: null,
    address: addressOrNull(office),
    email: textOrNull(office.email),
    phone: textOrNull(office.phone),
    representative: null,
  }
}

/** O formulário de parte → os dados gravados. */
export function personFromInput(input: ContractPartyInput): PartyPersonData {
  const isCompany = input.person_type === 'company'
  return {
    person_type: input.person_type,
    name: textOrNull(input.name),
    document: digitsOrNull(input.document),
    rg: isCompany ? null : textOrNull(input.rg),
    rg_issuer: isCompany ? null : textOrNull(input.rg_issuer),
    sex: isCompany ? null : (input.sex ?? null),
    birth_date: isCompany ? null : textOrNull(input.birth_date),
    nationality: isCompany ? null : textOrNull(input.nationality),
    marital_status: isCompany ? null : (input.marital_status ?? null),
    profession: isCompany ? null : textOrNull(input.profession),
    address: addressOrNull(input.address),
    email: textOrNull(input.email),
    phone: textOrNull(input.phone),
    representative: isCompany ? textOrNull(input.representative) : null,
  }
}

/** A parte como o formulário a edita: texto vazio onde há null. */
export function partyToInput(
  party: Pick<ContractParty, 'role_key' | 'role_label'> & PartyPersonData,
): ContractPartyInput {
  return {
    role_key: party.role_key,
    role_label: party.role_label,
    person_type: party.person_type,
    name: party.name ?? '',
    document: party.document ? formatDocument(party.document) : '',
    rg: party.rg ?? '',
    rg_issuer: party.rg_issuer ?? '',
    sex: party.sex,
    birth_date: party.birth_date ?? '',
    nationality: party.nationality ?? '',
    marital_status: party.marital_status,
    profession: party.profession ?? '',
    address: {
      street: party.address?.street ?? '',
      number: party.address?.number ?? '',
      complement: party.address?.complement ?? '',
      neighborhood: party.address?.neighborhood ?? '',
      city: party.address?.city ?? '',
      state: party.address?.state ?? '',
      zip: party.address?.zip ?? '',
    },
    email: party.email ?? '',
    phone: party.phone ?? '',
    representative: party.representative ?? '',
  }
}

/**
 * A parte como o cadastro de cliente a recebe ("Cadastrar como cliente"):
 * abre o formulário de cliente já preenchido, para conferir antes de salvar.
 */
export function clientDefaultsFromParty(party: PartyPersonData): Partial<ClientWithRelations> {
  const isCompany = party.person_type === 'company'
  const now = new Date().toISOString()
  const address = party.address
  return {
    type: party.person_type,
    ...(isCompany
      ? {
          company_name: party.name ?? '',
          cnpj: party.document ?? '',
          contact_person: party.representative ?? '',
        }
      : {
          name: party.name ?? '',
          cpf: party.document ?? '',
          rg: party.rg,
          rg_issuer: party.rg_issuer,
          sex: party.sex,
          birth_date: party.birth_date,
          nationality: party.nationality,
          marital_status: party.marital_status,
          profession: party.profession,
        }),
    email: party.email,
    phone: party.phone,
    addresses: address
      ? [
          {
            id: 'novo',
            client_id: '',
            kind: isCompany ? 'comercial' : 'residencial',
            street: address.street,
            number: address.number,
            complement: address.complement,
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            zip: address.zip,
            is_primary: true,
            created_at: now,
            updated_at: now,
          },
        ]
      : [],
  } as Partial<ClientWithRelations>
}

/** O que falta na qualificação — para a parte avisar antes da minuta. */
export function missingPartyData(party: PartyPersonData): string[] {
  const missing: string[] = []
  if (!party.name) missing.push('nome')
  if (!party.document) missing.push(party.person_type === 'company' ? 'CNPJ' : 'CPF')
  if (party.person_type === 'individual') {
    if (!party.rg) missing.push('RG')
    if (!party.marital_status) missing.push('estado civil')
    if (!party.profession) missing.push('profissão')
    if (!party.nationality) missing.push('nacionalidade')
  } else if (!party.representative) {
    missing.push('representante')
  }
  if (!party.address?.street || !party.address?.city) missing.push('endereço')
  return missing
}
