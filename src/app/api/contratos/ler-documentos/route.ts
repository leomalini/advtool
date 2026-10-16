import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { lookupCnpj } from '@/lib/brasilapi/cnpj'
import { createAssistantModel } from '@/features/ia/model'
import { isProviderCreditError, isProviderQuotaError } from '@/features/ia/providerErrors'
import { readDocumentsAsParts, type ReadableDocument } from '@/features/ia/files/documentParts'
import { classifyTemplateFields } from '@/features/documentos/templates/fieldSettings'
import { addOption } from '@/features/contratos/reading/mergeReading'
import { runReader } from '@/features/contratos/reading/runReader'
import {
  RECEITA_SOURCE,
  type ReaderResult,
  type ReadPerson,
} from '@/features/contratos/reading/readerTypes'
import { parseFieldSettings, parsePartyRoles } from '@/schemas/documentTemplate.schema'
import { PARTY_ROLE_PRESETS } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'

/** Segundos. Dez documentos com PDF e imagem passam fácil de um minuto. */
export const maxDuration = 180

/** Por leitura. O Gemini aceita até 100 MB por pedido; a folga cobre o texto. */
const MAX_DOCUMENTS = 10
const MAX_TOTAL_BYTES = 50 * 1024 * 1024

/** Consultas de CNPJ por leitura — cada uma é uma ida à BrasilAPI. */
const MAX_CNPJ_LOOKUPS = 3

const bodySchema = z.object({
  contractId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(MAX_DOCUMENTS),
  mode: z.enum(['partes', 'importar']),
})

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

interface TemplateRow {
  fields: string[] | null
  field_settings: unknown
  parties: unknown
}

/** O cliente que já usa o CPF/CNPJ de cada pessoa — completar em vez de
 * duplicar. Uma consulta para todas. */
async function matchClients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  persons: ReadPerson[],
): Promise<void> {
  const documents = [
    ...new Set(persons.map((person) => person.fields.document?.[0]?.value).filter(Boolean)),
  ] as string[]
  if (documents.length === 0) return

  const list = documents.join(',')
  const { data, error } = await supabase
    .from('clients')
    .select('id, type, name, company_name, trade_name, cpf_digits, cnpj_digits')
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
      }
    }
  }
}

/** A Receita como mais uma origem para a pessoa jurídica: o que bater com os
 * documentos se junta; o que divergir vira conflito, como qualquer outro. */
async function enrichCompanies(persons: ReadPerson[]): Promise<void> {
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

/**
 * POST /api/contratos/ler-documentos — o leitor de documentos.
 *
 * Um pedido ao provedor para todos os documentos (até 10, 50 MB): a IA
 * descreve cada documento, e o código junta as pessoas, aponta conflitos e
 * sugere os campos do modelo. Nada é gravado aqui — a tela mostra o
 * resultado para conferir, e só então cria as partes.
 *
 * Os documentos precisam ser do contrato (já estão no Storage: a Vercel não
 * aceita arquivo grande no corpo do pedido). Permissão e leitura com o client
 * de quem pede: a RLS decide o que entra.
 */
export async function POST(request: Request) {
  const guard = await requirePermissionApi('contratos', 'update')
  if (!guard.ok) return guard.response

  const assistantModel = createAssistantModel()
  if (!assistantModel.ok) {
    console.error('[contratos] IA indisponível:', assistantModel.reason)
    return jsonError('A IA não está configurada neste ambiente.', 503)
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError('Requisição inválida.', 400)
  const { contractId, documentIds, mode } = parsed.data
  const importing = mode === 'importar'

  const supabase = await createClient()
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, template_id')
    .eq('id', contractId)
    .maybeSingle()
  if (contractError) {
    console.error('[contratos] leitura do contrato falhou:', contractError.code, contractError.message)
    return jsonError('Não foi possível ler o contrato.', 500)
  }
  if (!contract) return jsonError('Contrato não encontrado.', 404)

  const [{ data: rows, error: documentsError }, templateResult] = await Promise.all([
    supabase
      .from('documents')
      .select('id, file_name, file_path, file_size')
      .eq('contract_id', contractId)
      .in('id', documentIds),
    contract.template_id
      ? supabase
          .from('document_templates')
          .select('fields, field_settings, parties')
          .eq('id', contract.template_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (documentsError) {
    console.error('[contratos] leitura dos documentos falhou:', documentsError.code, documentsError.message)
    return jsonError('Não foi possível ler os documentos.', 500)
  }

  // Na ordem do pedido: o primeiro é o contrato, na importação.
  const documents = documentIds
    .map((id) => (rows ?? []).find((row) => row.id === id))
    .filter((row): row is ReadableDocument => !!row)
  if (documents.length === 0) return jsonError('Nenhum documento deste contrato foi enviado.', 400)
  const totalBytes = documents.reduce((sum, document) => sum + Number(document.file_size), 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    return jsonError('Os documentos passam de 50 MB juntos. Leia em duas vezes.', 413)
  }

  const template = templateResult.data as TemplateRow | null
  const templateRoles: TemplatePartyRole[] = template ? parsePartyRoles(template.parties) : []
  const roles = [
    ...templateRoles,
    ...PARTY_ROLE_PRESETS.filter((preset) => !templateRoles.some((role) => role.key === preset.key)),
  ]
  const manualFields = template
    ? classifyTemplateFields(
        template.fields ?? [],
        parseFieldSettings(template.field_settings),
        templateRoles,
      ).manual
    : []

  let numbered = 0
  const { parts, skipped, read } = await readDocumentsAsParts(supabase, documents, (document) => {
    numbered += 1
    return `Documento ${numbered}: ${document.file_name}`
  })
  if (read.length === 0) {
    return NextResponse.json(
      { error: `Nenhum documento pôde ser lido: ${skipped.join('; ')}.` },
      { status: 422 },
    )
  }

  try {
    const result = await runReader({
      model: assistantModel.model,
      providerOptions: assistantModel.providerOptions,
      parts,
      documents: read,
      roles,
      manualFields,
      importing,
    })
    await Promise.all([matchClients(supabase, result.persons), enrichCompanies(result.persons)])
    return NextResponse.json({ ...result, skipped } satisfies ReaderResult)
  } catch (modelError) {
    if (isProviderQuotaError(modelError)) {
      return jsonError('A cota diária da IA acabou. Tente amanhã ou digite as partes.', 429)
    }
    if (isProviderCreditError(modelError)) {
      return jsonError(
        'Os créditos da conta da IA acabaram. Quem administra a conta precisa pôr saldo; ' +
          'enquanto isso, digite as partes.',
        402,
      )
    }
    console.error(`[contratos] leitura (${assistantModel.provider}) falhou:`, modelError)
    return jsonError('A IA não conseguiu ler os documentos agora. Tente de novo.', 502)
  }
}
