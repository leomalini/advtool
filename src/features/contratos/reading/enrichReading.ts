import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupCnpj } from '@/lib/brasilapi/cnpj'
import { addOption } from './mergeReading'
import { RECEITA_SOURCE, type ReadPerson } from './readerTypes'

/**
 * O que completa a leitura depois da IA — SÓ SERVIDOR. Usado pela rota da tela
 * e pela tool `ler_documentos` do Assistente.
 */

/** Consultas de CNPJ por leitura — cada uma é uma ida à BrasilAPI. */
const MAX_CNPJ_LOOKUPS = 3

/** O cadastro que já usa o CPF/CNPJ de cada pessoa — completar em vez de
 * duplicar. Procura em toda pessoa, cliente ou não: a unicidade do documento
 * vale para a tabela inteira (migration 59). Uma consulta para todas, com o
 * client de quem pede (RLS). */
export async function matchClients(supabase: SupabaseClient, persons: ReadPerson[]): Promise<void> {
  const documents = [
    ...new Set(persons.map((person) => person.fields.document?.[0]?.value).filter(Boolean)),
  ] as string[]
  if (documents.length === 0) return

  const list = documents.join(',')
  const { data, error } = await supabase
    .from('clients')
    .select('id, type, name, company_name, trade_name, cpf_digits, cnpj_digits, is_client')
    .or(`cpf_digits.in.(${list}),cnpj_digits.in.(${list})`)
  if (error) {
    // Sem a conferência a leitura ainda serve; só não aponta o cadastro.
    console.error('[contratos] busca de clientes por documento falhou:', error.code, error.message)
    return
  }
  for (const person of persons) {
    const document = person.fields.document?.[0]?.value
    const row = (data ?? []).find(
      (client) => client.cpf_digits === document || client.cnpj_digits === document,
    )
    if (row) {
      person.clientMatch = {
        id: row.id as string,
        name: ((row.type === 'company' ? row.company_name : row.name) as string | null) ?? '',
        isClient: row.is_client === true,
      }
    }
  }
}

/** A Receita como mais uma origem para a pessoa jurídica: o que bater com os
 * documentos se junta; o que divergir vira conflito, como qualquer outro. */
export async function enrichCompanies(persons: ReadPerson[]): Promise<void> {
  const companies = persons
    .filter((person) => person.personType === 'company')
    .filter((person) => person.fields.document?.[0]?.value.length === 14)
    .slice(0, MAX_CNPJ_LOOKUPS)

  await Promise.all(
    companies.map(async (person) => {
      const result = await lookupCnpj(person.fields.document?.[0]?.value as string)
      if (!result.ok) return
      const { company } = result
      addOption(person.fields, 'name', company.company_name, RECEITA_SOURCE)
      addOption(person.fields, 'email', company.email?.toLowerCase(), RECEITA_SOURCE)
      addOption(person.fields, 'phone', company.phone, RECEITA_SOURCE)
      if (company.address_street || company.address_city) {
        addOption(
          person.fields,
          'address',
          {
            street: company.address_street,
            number: company.address_number,
            complement: company.address_complement,
            neighborhood: company.address_neighborhood,
            city: company.address_city,
            state: company.address_state,
            zip: company.address_zip,
          },
          RECEITA_SOURCE,
        )
      }
    }),
  )
}
