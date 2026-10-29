import { tool } from 'ai'
import { z } from 'zod'
import { TemplateSyntaxError } from '@/features/documentos/templates/docx'
import { classifyTemplateFields } from '@/features/documentos/templates/fieldSettings'
import { personFieldValues, rolesInUse } from '@/features/documentos/templates/partyFields'
import { enrichCompanies, matchClients } from '@/features/contratos/reading/enrichReading'
import { runReader } from '@/features/contratos/reading/runReader'
import { RECEITA_SOURCE, type ReadPerson } from '@/features/contratos/reading/readerTypes'
import {
  conflictingFields,
  formatPersonField,
  PERSON_FIELD_LABELS,
  PERSON_FIELD_ORDER,
} from '@/features/contratos/reading/reviewState'
import { personFromClient, personFromOffice } from '@/features/contratos/utils/partyData'
import {
  fillBlanks,
  partyToolDataSchema,
  personFromToolData,
  toolDataFromPerson,
} from '@/features/contratos/utils/partyToolInput'
import { readDocumentsAsParts, type ReadableDocument } from '@/features/ia/files/documentParts'
import { createAssistantModel } from '@/features/ia/model'
import { isProviderCreditError, isProviderQuotaError } from '@/features/ia/providerErrors'
import { contractKindSchema, contractStatusSchema } from '@/schemas/contract.schema'
import { parseFieldSettings, parsePartyRoles } from '@/schemas/documentTemplate.schema'
import type { ClientWithRelations } from '@/types/cliente.types'
import {
  CONTRACT_FILE_ROLE_LABELS,
  CONTRACT_KIND_LABELS,
  CONTRACT_PARTY_SOURCE_LABELS,
  CONTRACT_SITUATION_LABELS,
  getContractSituation,
  PARTY_ROLE_PRESETS,
  SOURCE_KIND_LABELS,
  sourceKindLabel,
  type ContractFileRole,
  type ContractKind,
  type ContractParty,
  type ContractStatus,
  type PartyPersonData,
} from '@/types/contract.types'
import {
  FINANCIAL_SITUATION_LABELS,
  getFinancialSituation,
  type FinancialEntry,
} from '@/types/financialEntry.types'
import type { OfficeSettings } from '@/types/officeSettings.types'
import { AI_FILES_BUCKET } from '../files/constants'
import { getAiFile } from '../files/storage'
import { clientLabel, dateSchema, ilikeFilter, limitSchema, toolError, type ToolClient } from './shared'
import { fillInputShape, loadSource, renderAndSave, type TemplateToolsContext } from './templates'

/** Os mesmos tetos da leitura pela tela: 10 documentos, 50 MB. */
const MAX_READ_DOCUMENTS = 10
const MAX_READ_BYTES = 50 * 1024 * 1024

const CLIENT_SUMMARY = 'client:clients(type, name, company_name, trade_name)'

interface ContractRow {
  id: string
  title: string
  kind: ContractKind
  status: ContractStatus
  total_amount: number | null
  installments: number | null
  success_fee_percent: number | null
  start_date: string | null
  end_date: string | null
  notice_days: number
  signed_at: string | null
  client_id: string | null
  legal_process_id: string | null
  client: Parameters<typeof clientLabel>[0]
  legal_process: { cnj_number: string | null } | null
}

const CONTRACT_COLUMNS =
  'id, title, kind, status, total_amount, installments, success_fee_percent, start_date, ' +
  `end_date, notice_days, signed_at, client_id, legal_process_id, ${CLIENT_SUMMARY}, ` +
  'legal_process:legal_processes(cnj_number)'

function describeContract(row: ContractRow) {
  return {
    id: row.id,
    titulo: row.title,
    tipo: CONTRACT_KIND_LABELS[row.kind],
    situacao: CONTRACT_SITUATION_LABELS[getContractSituation(row)],
    cliente: clientLabel(row.client),
    cliente_id: row.client_id,
    processo_cnj: row.legal_process?.cnj_number ?? null,
    valor_total: row.total_amount,
    parcelas: row.installments,
    exito_percentual: row.success_fee_percent,
    inicio: row.start_date,
    fim: row.end_date,
    assinado_em: row.signed_at,
    link: `/contratos/${row.id}`,
  }
}

async function fetchClient(supabase: ToolClient, clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*, addresses:client_addresses(*), contacts:client_contacts(*)')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ClientWithRelations | null) ?? null
}

/** Uma pessoa lida, como o Assistente a recebe: os dados sem conflito já no
 * formato que gerar_contrato e cadastrar_cliente aceitam; os conflitos à parte,
 * para perguntar. */
function describeReadPerson(
  person: ReadPerson,
  index: number,
  sourceName: (id: string) => string,
) {
  const conflicts = conflictingFields(person)
  const settled: Record<string, unknown> = {}
  for (const field of PERSON_FIELD_ORDER) {
    const options = person.fields[field]
    if (options?.length === 1) settled[field] = options[0].value
  }
  const data = toolDataFromPerson({
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
    ...settled,
  } as PartyPersonData)
  const essentials =
    person.personType === 'company'
      ? (['document', 'address', 'representative'] as const)
      : (['document', 'rg', 'nationality', 'marital_status', 'profession', 'address'] as const)

  return {
    ref: index + 1,
    tipo_pessoa: data.tipo_pessoa,
    papel_sugerido: person.suggestedRoleKey,
    lido_de: [...new Set(person.documentIds.map(sourceName))],
    cliente_cadastrado: person.clientMatch
      ? {
          id: person.clientMatch.id,
          nome: person.clientMatch.name,
          // Cadastrada sem ser cliente (parte contrária, fiador…): não é a
          // cliente do contrato.
          e_cliente: person.clientMatch.isClient,
        }
      : null,
    dados: data,
    conflitos: conflicts.map((field) => ({
      dado: PERSON_FIELD_LABELS[field],
      opcoes: (person.fields[field] ?? []).map((option) => ({
        valor: formatPersonField(field, option.value),
        de: option.sources.map(sourceName),
      })),
    })),
    faltando: essentials
      .filter((field) => !person.fields[field]?.length)
      .map((field) => PERSON_FIELD_LABELS[field]),
  }
}

const partyInputSchema = z.object({
  papel: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(40)
    .describe('Chave do papel: um dos "papeis" do modelo (listar_modelos) ou um comum.'),
  papel_rotulo: z.string().max(60).optional().describe('Nome do papel, ex.: Locatário.'),
  cliente_id: z
    .string()
    .uuid()
    .optional()
    .describe('Parte que é cliente cadastrado: os dados vêm do cadastro.'),
  escritorio: z.boolean().optional().describe('true: a parte é o próprio escritório.'),
  dados: partyToolDataSchema
    .optional()
    .describe(
      'Parte que não é cliente (ou para completar o cadastro): os dados lidos e MOSTRADOS ao ' +
        'usuário, com os conflitos já escolhidos por ele.',
    ),
})

/** A parte como o modelo a usa — do cadastro, do escritório ou dos dados. */
async function buildParty(
  supabase: ToolClient,
  input: z.infer<typeof partyInputSchema>,
): Promise<PartyPersonData | { error: string }> {
  if (input.cliente_id) {
    const client = await fetchClient(supabase, input.cliente_id)
    if (!client) return { error: `Cliente ${input.cliente_id} não encontrado ou sem acesso.` }
    const person = personFromClient(client)
    return input.dados ? fillBlanks(person, personFromToolData(input.dados)) : person
  }
  if (input.escritorio) {
    const { data, error } = await supabase.from('office_settings').select('*').maybeSingle()
    if (error) throw error
    if (!data) return { error: 'Dados do escritório não cadastrados (Configurações → Geral).' }
    return personFromOffice(data as OfficeSettings)
  }
  if (input.dados) return personFromToolData(input.dados)
  return { error: `A parte "${input.papel}" precisa de cliente_id, escritorio ou dados.` }
}

const contractNumbersSchema = z
  .object({
    valor_total: z.number().nonnegative().optional().describe('Em reais, ex.: 5000'),
    parcelas: z.number().int().min(1).max(360).optional(),
    primeiro_vencimento: dateSchema.optional(),
    exito_percentual: z.number().min(0).max(100).optional(),
    inicio: dateSchema.optional(),
    fim: dateSchema.optional(),
    reajuste: z.string().max(40).optional().describe('Índice, ex.: IPCA'),
  })
  .describe('Números do contrato: só os que o usuário disse ou que vieram do contrato lido.')

export function createContractTools(supabase: ToolClient, context: TemplateToolsContext) {
  return {
    listar_contratos: tool({
      description:
        'Contratos do escritório (módulo Contratos): honorários, do cliente com terceiros e do ' +
        'escritório, com situação (rascunho, vigente, vencendo, vencido…), valor e vigência.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        processo_id: z.string().uuid().optional(),
        status: contractStatusSchema.optional(),
        tipo: contractKindSchema.optional(),
        vencendo_ate: dateSchema.optional().describe('Só os vigentes com fim até esta data.'),
        termo: z.string().max(120).optional().describe('Trecho do nome do contrato.'),
        limite: limitSchema,
      }),
      execute: async ({ cliente_id, processo_id, status, tipo, vencendo_ate, termo, limite }) => {
        let query = supabase
          .from('contracts')
          .select(CONTRACT_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(limite ?? 10)
        if (cliente_id) query = query.eq('client_id', cliente_id)
        if (processo_id) query = query.eq('legal_process_id', processo_id)
        if (status) query = query.eq('status', status)
        if (tipo) query = query.eq('kind', tipo)
        if (vencendo_ate) query = query.eq('status', 'vigente').lte('end_date', vencendo_ate)
        if (termo?.trim()) query = query.or(ilikeFilter('title', termo))

        const { data, error } = await query
        if (error) return toolError('os contratos', error)
        return { contratos: ((data ?? []) as unknown as ContractRow[]).map(describeContract) }
      },
    }),

    ver_contrato: tool({
      description:
        'Detalhes de um contrato: números, vigência, as partes com a qualificação, os arquivos ' +
        '(minuta, versão assinada, anexos) e os lançamentos do Financeiro ligados a ele.',
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async ({ id }) => {
        const [contract, parties, documents, entries] = await Promise.all([
          supabase.from('contracts').select(CONTRACT_COLUMNS).eq('id', id).maybeSingle(),
          supabase.from('contract_parties').select('*').eq('contract_id', id).order('position'),
          supabase
            .from('documents')
            .select('id, file_name, contract_file_role, source_kind')
            .eq('contract_id', id)
            .order('created_at'),
          supabase
            .from('financial_entries')
            .select(
              'id, description, type, amount, status, settlement_kind, due_date, ' +
                'condition_description, paid_at',
            )
            .eq('contract_id', id)
            .order('due_date', { ascending: true, nullsFirst: false }),
        ])
        if (contract.error) return toolError('o contrato', contract.error)
        if (!contract.data) return { error: 'Contrato não encontrado ou sem acesso.' }
        if (parties.error) return toolError('as partes', parties.error)
        if (documents.error) return toolError('os arquivos', documents.error)
        type EntryRow = Pick<
          FinancialEntry,
          | 'id'
          | 'description'
          | 'type'
          | 'amount'
          | 'status'
          | 'settlement_kind'
          | 'due_date'
          | 'condition_description'
          | 'paid_at'
        >

        return {
          ...describeContract(contract.data as unknown as ContractRow),
          partes: ((parties.data ?? []) as ContractParty[]).map((party) => ({
            papel: party.role_label,
            nome: party.name,
            origem: CONTRACT_PARTY_SOURCE_LABELS[party.source],
            cliente_id: party.client_id,
            qualificacao: personFieldValues(party).qualificacao ?? null,
          })),
          arquivos: (
            (documents.data ?? []) as {
              id: string
              file_name: string
              contract_file_role: ContractFileRole
              source_kind: string | null
            }[]
          ).map((document) => ({
            id: document.id,
            nome: document.file_name,
            papel: CONTRACT_FILE_ROLE_LABELS[document.contract_file_role],
            tipo: sourceKindLabel(document.source_kind),
          })),
          // Sem acesso ao Financeiro a RLS devolve lista vazia, não erro: a
          // falha de verdade não derruba o resto do contrato.
          lancamentos: entries.error
            ? null
            : ((entries.data ?? []) as unknown as EntryRow[]).map((entry) => ({
                id: entry.id,
                descricao: entry.description,
                tipo: entry.type,
                valor: Number(entry.amount),
                situacao: FINANCIAL_SITUATION_LABELS[getFinancialSituation(entry)],
                vencimento: entry.settlement_kind === 'scheduled' ? entry.due_date : null,
                condicao: entry.condition_description,
                pago_em: entry.paid_at,
              })),
        }
      },
    }),

    ler_documentos: tool({
      description:
        'Lê documentos de pessoas e bens (CNH, RG, certidões, comprovante de residência, ' +
        'contrato social, matrícula, CRLV, contratos) de uma vez — anexos desta conversa ou ' +
        'documentos cadastrados — e devolve as pessoas já juntadas (por CPF/CNPJ ou nome), os ' +
        'conflitos entre documentos, quem já é cliente e valores para os campos do modelo. ' +
        'Gasta 1 pedido à IA. Use antes de gerar_contrato ou cadastrar_cliente com dados de ' +
        'documentos.',
      inputSchema: z.object({
        arquivos: z
          .array(
            z.object({
              origem: z.enum(['conversa', 'documentos']),
              id: z.string().uuid(),
            }),
          )
          .min(1)
          .max(MAX_READ_DOCUMENTS),
        modelo_id: z
          .string()
          .uuid()
          .optional()
          .describe('Modelo do contrato, se já escolhido: sugere papéis e campos manuais.'),
        importar_contrato: z
          .boolean()
          .optional()
          .describe('true quando o 1º arquivo é um contrato pronto a importar.'),
      }),
      execute: async ({ arquivos, modelo_id, importar_contrato }) => {
        const model = createAssistantModel('contract_reader', {
          userId: context.userId,
          conversationId: context.conversationId,
        })
        if (!model.ok) return { error: 'A IA não está configurada neste ambiente.' }

        const documents: (ReadableDocument & { origem: 'conversa' | 'documentos' })[] = []
        const missing: string[] = []
        for (const { origem, id } of arquivos) {
          if (origem === 'conversa') {
            const file = await getAiFile(supabase, id)
            if (!file) {
              missing.push(id)
              continue
            }
            documents.push({
              id,
              origem,
              file_name: file.file_name,
              file_path: file.storage_path,
              file_size: file.size_bytes,
              bucket: AI_FILES_BUCKET,
              extracted_text: file.extracted_text,
            })
          } else {
            const { data, error } = await supabase
              .from('documents')
              .select('id, file_name, file_path, file_size')
              .eq('id', id)
              .maybeSingle()
            if (error) return toolError('os documentos', error)
            if (!data) {
              missing.push(id)
              continue
            }
            documents.push({ ...(data as ReadableDocument), origem })
          }
        }
        if (documents.length === 0) return { error: 'Nenhum dos arquivos foi encontrado.' }
        const total = documents.reduce((sum, document) => sum + Number(document.file_size), 0)
        if (total > MAX_READ_BYTES) {
          return { error: 'Os arquivos passam de 50 MB juntos. Leia em duas vezes.' }
        }

        let roles: { key: string; label: string }[] = []
        let manualFields: ReturnType<typeof classifyTemplateFields>['manual'] = []
        if (modelo_id) {
          const { data, error } = await supabase
            .from('document_templates')
            .select('fields, field_settings, parties')
            .eq('id', modelo_id)
            .maybeSingle()
          if (error) return toolError('o modelo', error)
          if (data) {
            roles = parsePartyRoles(data.parties)
            manualFields = classifyTemplateFields(
              (data.fields as string[] | null) ?? [],
              parseFieldSettings(data.field_settings),
              roles,
            ).manual
          }
        }
        const allRoles = [
          ...roles,
          ...PARTY_ROLE_PRESETS.filter((preset) => !roles.some((role) => role.key === preset.key)),
        ]

        try {
          let numbered = 0
          const { parts, skipped, read } = await readDocumentsAsParts(
            supabase,
            documents,
            (document) => {
              numbered += 1
              return `Documento ${numbered}: ${document.file_name}`
            },
          )
          if (read.length === 0) return { error: `Nada pôde ser lido: ${skipped.join('; ')}.` }

          const result = await runReader({
            model: model.model,
            providerOptions: model.providerOptions,
            parts,
            documents: read,
            roles: allRoles,
            manualFields,
            importing: !!importar_contrato,
          })
          await Promise.all([matchClients(supabase, result.persons), enrichCompanies(result.persons)])

          const sourceName = (id: string) => {
            if (id === RECEITA_SOURCE) return 'Receita (CNPJ)'
            const summary = result.documents.find((item) => item.id === id)
            return summary ? `${SOURCE_KIND_LABELS[summary.kind]} (${summary.name})` : 'documento'
          }

          return {
            documentos: result.documents.map((summary) => ({
              arquivo_id: summary.id,
              origem: documents.find((document) => document.id === summary.id)?.origem,
              nome: summary.name,
              tipo: summary.kind,
              resumo: summary.summary,
              ilegivel: summary.illegible,
            })),
            pessoas: result.persons.map((person, index) =>
              describeReadPerson(person, index, sourceName),
            ),
            campos_do_modelo: result.fieldSuggestions.map((suggestion) => ({
              campo: suggestion.field,
              rotulo: suggestion.label,
              opcoes: suggestion.options.map((option) => ({
                valor: option.value,
                de: option.sources.map(sourceName),
              })),
            })),
            ...(result.contract ? { contrato: result.contract } : {}),
            nao_lidos: [...skipped, ...missing.map((id) => `${id} (não encontrado)`)],
            lembrete:
              'Mostre ao usuário o que foi lido de cada documento, os conflitos e o que falta, ' +
              'e pergunte antes de gerar ou cadastrar.',
          }
        } catch (error) {
          if (isProviderQuotaError(error)) {
            return { error: 'A IA atingiu o limite de pedidos por agora — a leitura não foi feita.' }
          }
          if (isProviderCreditError(error)) {
            return { error: 'Os créditos da conta da IA acabaram — a leitura não foi feita.' }
          }
          console.error('[ia] tool ler_documentos falhou:', error)
          return { error: 'Não foi possível ler os documentos.' }
        }
      },
    }),

    gerar_contrato: tool({
      description:
        'Gera a minuta de um contrato num modelo (.docx): cadastrado (modelo_id) ou anexado ' +
        '(arquivo_id). Preenche os campos de cada papel com as PARTES informadas — cliente ' +
        'cadastrado, o escritório ou dados lidos e mostrados ao usuário — e os campos ' +
        '{contrato_*} com os números informados. O arquivo fica na conversa; para registrar o ' +
        'contrato, ofereça registrar_contrato.',
      inputSchema: z.object({
        modelo_id: z.string().uuid().optional(),
        arquivo_id: z.string().uuid().optional().describe('Ou: .docx anexado como modelo.'),
        partes: z.array(partyInputSchema).max(10),
        cliente_id: z
          .string()
          .uuid()
          .optional()
          .describe('Cliente do contrato, para os campos {cliente_*}. Padrão: a 1ª parte cliente.'),
        processo_id: z.string().uuid().optional(),
        contrato: contractNumbersSchema.optional(),
        ...fillInputShape,
      }),
      execute: async (input) => {
        if (!input.modelo_id === !input.arquivo_id) {
          return { error: 'Informe modelo_id (modelo cadastrado) ou arquivo_id (anexo), um dos dois.' }
        }
        try {
          const source = await loadSource(supabase, {
            templateId: input.modelo_id,
            fileId: input.arquivo_id,
          })
          if ('error' in source) return source

          // O .docx anexado não declara papéis: valem os das partes pedidas,
          // se o arquivo usa os campos deles.
          const requested = input.partes.map((party) => ({
            key: party.papel,
            label: party.papel_rotulo?.trim() || party.papel,
          }))
          const roles =
            source.roles.length > 0 ? source.roles : rolesInUse(source.fields, requested)

          const parties = []
          for (const [index, party] of input.partes.entries()) {
            const person = await buildParty(supabase, party)
            if ('error' in person) return person
            parties.push({ ...person, role_key: party.papel, position: index })
          }

          const contrato = input.contrato
          return await renderAndSave(supabase, context, {
            source,
            roles,
            clientId:
              input.cliente_id ?? input.partes.find((party) => party.cliente_id)?.cliente_id ?? null,
            processId: input.processo_id ?? null,
            contractNumbers: {
              total_amount: contrato?.valor_total ?? null,
              installments: contrato?.parcelas ?? null,
              first_due_date: contrato?.primeiro_vencimento ?? null,
              success_fee_percent: contrato?.exito_percentual ?? null,
              start_date: contrato?.inicio ?? null,
              end_date: contrato?.fim ?? null,
              adjustment_index: contrato?.reajuste ?? null,
            },
            parties,
            advogados_ids: input.advogados_ids,
            valores: input.valores,
            escolhas: input.escolhas,
            textos: input.textos,
            nome_arquivo: input.nome_arquivo,
          })
        } catch (error) {
          if (error instanceof TemplateSyntaxError) return { error: error.message }
          console.error('[ia] tool gerar_contrato falhou:', error)
          return { error: 'Não foi possível gerar o contrato.' }
        }
      },
    }),
  }
}
