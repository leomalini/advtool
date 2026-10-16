import { z } from 'zod'
import { getPrimaryAddress } from '@/features/clientes/utils/qualificacao'
import { parseLooseDate } from '@/features/documentos/templates/spellOut'
import type { AddressInput, CreateClientInput } from '@/schemas/cliente.schema'
import type { ClientWithRelations, MaritalStatus } from '@/types/cliente.types'
import type { PartyAddress, PartyPersonData } from '@/types/contract.types'
import { formatCEP, formatDocument } from '@/utils/format'

/**
 * Os dados de uma pessoa como o Assistente os escreve (em português, como as
 * demais tools) e as conversões para parte de contrato e cadastro de cliente.
 * Usado pelas tools de contrato e pelas ações que a tela confirma.
 */

const text = (max: number, description?: string) => {
  const schema = z.string().trim().max(max).optional()
  return description ? schema.describe(description) : schema
}

export const partyToolDataSchema = z.object({
  tipo_pessoa: z.enum(['fisica', 'juridica']),
  nome: z.string().trim().min(1).max(200).describe('Nome completo ou razão social'),
  cpf_cnpj: text(30, 'CPF ou CNPJ'),
  rg: text(30),
  rg_orgao: text(30, 'Órgão emissor com UF, ex.: SSP/ES'),
  sexo: z.enum(['masculino', 'feminino']).optional(),
  nascimento: text(10, 'AAAA-MM-DD'),
  nacionalidade: text(60, 'No gênero da pessoa, ex.: brasileira'),
  estado_civil: z
    .enum(['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'separado'])
    .optional(),
  profissao: text(120),
  endereco: z
    .object({
      logradouro: text(200),
      numero: text(20),
      complemento: text(100),
      bairro: text(100),
      cidade: text(100),
      uf: text(2),
      cep: text(10),
    })
    .optional(),
  email: text(200),
  telefone: text(30),
  representante: text(200, 'Pessoa jurídica: quem assina por ela'),
})

export type PartyToolData = z.infer<typeof partyToolDataSchema>

function clean(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function toAddress(data: PartyToolData['endereco']): PartyAddress | null {
  if (!data) return null
  const address: PartyAddress = {
    street: clean(data.logradouro),
    number: clean(data.numero),
    complement: clean(data.complemento),
    neighborhood: clean(data.bairro),
    city: clean(data.cidade),
    state: clean(data.uf)?.toUpperCase() ?? null,
    zip: normalizeZip(data.cep),
  }
  return Object.values(address).some(Boolean) ? address : null
}

/** "29090000" → "29090-000"; o que não tem 8 dígitos fica como veio. */
export function normalizeZip(value: string | null | undefined): string | null {
  const trimmed = clean(value)
  if (!trimmed) return null
  return trimmed.replace(/\D/g, '').length === 8 ? formatCEP(trimmed) : trimmed
}

/** O que o Assistente escreveu, no formato da parte. */
export function personFromToolData(data: PartyToolData): PartyPersonData {
  const isCompany = data.tipo_pessoa === 'juridica'
  const document = data.cpf_cnpj?.replace(/\D/g, '') ?? ''
  return {
    person_type: isCompany ? 'company' : 'individual',
    name: clean(data.nome),
    document: document.length === 11 || document.length === 14 ? document : null,
    rg: isCompany ? null : clean(data.rg),
    rg_issuer: isCompany ? null : (clean(data.rg_orgao)?.toUpperCase() ?? null),
    sex: isCompany ? null : (data.sexo ?? null),
    birth_date: isCompany || !data.nascimento ? null : parseLooseDate(data.nascimento),
    nationality: isCompany ? null : clean(data.nacionalidade),
    marital_status: isCompany ? null : ((data.estado_civil as MaritalStatus | undefined) ?? null),
    profession: isCompany ? null : clean(data.profissao),
    address: toAddress(data.endereco),
    email: clean(data.email)?.toLowerCase() ?? null,
    phone: clean(data.telefone),
    representative: isCompany ? clean(data.representante) : null,
  }
}

/** O caminho de volta: a pessoa no formato que o Assistente lê e devolve —
 * é assim que o que `ler_documentos` achou chega a `gerar_contrato`. */
export function toolDataFromPerson(person: PartyPersonData): PartyToolData {
  const address = person.address
  return {
    tipo_pessoa: person.person_type === 'company' ? 'juridica' : 'fisica',
    nome: person.name ?? '',
    cpf_cnpj: person.document ? formatDocument(person.document) : undefined,
    rg: person.rg ?? undefined,
    rg_orgao: person.rg_issuer ?? undefined,
    sexo: person.sex === 'masculino' || person.sex === 'feminino' ? person.sex : undefined,
    nascimento: person.birth_date ?? undefined,
    nacionalidade: person.nationality ?? undefined,
    estado_civil: person.marital_status ?? undefined,
    profissao: person.profession ?? undefined,
    endereco: address
      ? {
          logradouro: address.street ?? undefined,
          numero: address.number ?? undefined,
          complemento: address.complement ?? undefined,
          bairro: address.neighborhood ?? undefined,
          cidade: address.city ?? undefined,
          uf: address.state ?? undefined,
          cep: address.zip ?? undefined,
        }
      : undefined,
    email: person.email ?? undefined,
    telefone: person.phone ?? undefined,
    representante: person.representative ?? undefined,
  }
}

/** Preenche só os buracos de `base` com o que veio de `extra` — o cadastro
 * manda, a leitura completa. */
export function fillBlanks(base: PartyPersonData, extra: PartyPersonData): PartyPersonData {
  const filled = { ...base }
  for (const key of Object.keys(filled) as (keyof PartyPersonData)[]) {
    if (key === 'person_type') continue
    if (filled[key] === null || filled[key] === undefined) {
      ;(filled as unknown as Record<string, unknown>)[key] = extra[key]
    }
  }
  return filled
}

function toAddressInput(address: PartyAddress, kind: AddressInput['kind']): AddressInput {
  const zip = address.zip ? formatCEP(address.zip) : ''
  return {
    kind,
    street: address.street ?? undefined,
    number: address.number ?? undefined,
    complement: address.complement ?? undefined,
    neighborhood: address.neighborhood ?? undefined,
    city: address.city ?? undefined,
    state: address.state?.slice(0, 2) ?? '',
    // O cadastro recusa CEP fora do formato: melhor sem ele do que travar.
    zip: /^\d{5}-?\d{3}$/.test(zip) ? zip : '',
    is_primary: true,
  }
}

/**
 * O cadastro de cliente a partir dos dados de uma pessoa. Sem CPF/CNPJ não há
 * cadastro: o formulário de cliente também o exige.
 */
export function clientInputFromPerson(person: PartyPersonData): CreateClientInput | null {
  if (!person.name || !person.document) return null
  const addresses = person.address
    ? [toAddressInput(person.address, person.person_type === 'company' ? 'comercial' : 'residencial')]
    : []
  if (person.person_type === 'company') {
    if (person.document.length !== 14) return null
    return {
      type: 'company',
      company_name: person.name,
      cnpj: formatDocument(person.document),
      contact_person: person.representative ?? undefined,
      email: person.email ?? '',
      phone: person.phone ?? '',
      addresses,
    }
  }
  if (person.document.length !== 11) return null
  return {
    type: 'individual',
    name: person.name,
    cpf: formatDocument(person.document),
    rg: person.rg ?? undefined,
    rg_issuer: person.rg_issuer ?? undefined,
    sex: person.sex,
    birth_date: person.birth_date ?? '',
    nationality: person.nationality ?? undefined,
    marital_status: person.marital_status,
    profession: person.profession ?? undefined,
    email: person.email ?? '',
    phone: person.phone ?? '',
    addresses,
  }
}

/**
 * O que completar num cliente que já existe: só os campos vazios. Nome e
 * documento nunca mudam por aqui; o endereço só entra se não houver nenhum
 * (a lista de endereços é regravada inteira, e regravar apagaria os outros).
 */
export function clientCompletionPatch(
  client: ClientWithRelations,
  person: PartyPersonData,
): { patch: Partial<CreateClientInput>; fields: string[] } {
  const patch: Record<string, unknown> = {}
  const fields: string[] = []
  const set = (key: string, label: string, current: unknown, value: unknown) => {
    if ((current === null || current === undefined || current === '') && value) {
      patch[key] = value
      fields.push(label)
    }
  }

  if (client.type === 'individual') {
    set('rg', 'RG', client.rg, person.rg)
    set('rg_issuer', 'órgão emissor', client.rg_issuer, person.rg_issuer)
    set('sex', 'sexo', client.sex, person.sex)
    set('birth_date', 'nascimento', client.birth_date, person.birth_date)
    set('nationality', 'nacionalidade', client.nationality, person.nationality)
    set('marital_status', 'estado civil', client.marital_status, person.marital_status)
    set('profession', 'profissão', client.profession, person.profession)
  } else {
    set('contact_person', 'representante', client.contact_person, person.representative)
  }

  const hasEmail = !!client.email || (client.contacts ?? []).some((c) => c.type === 'email')
  const hasPhone = !!client.phone || (client.contacts ?? []).some((c) => c.type === 'phone')
  if (!hasEmail && person.email) {
    patch.email = person.email
    fields.push('e-mail')
  }
  if (!hasPhone && person.phone) {
    patch.phone = person.phone
    fields.push('telefone')
  }
  if (!getPrimaryAddress(client) && person.address) {
    patch.addresses = [
      toAddressInput(person.address, client.type === 'company' ? 'comercial' : 'residencial'),
    ]
    fields.push('endereço')
  }

  return { patch: patch as Partial<CreateClientInput>, fields }
}
