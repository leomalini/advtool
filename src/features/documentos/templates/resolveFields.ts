import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildQualificacao,
  formatAddressLine,
  formatMaritalStatus,
  getPrimaryAddress,
} from '@/features/clientes/utils/qualificacao'
import { formatCurrency } from '@/types/financialEntry.types'
import type { ClientContact, ClientWithRelations } from '@/types/cliente.types'
import type { Contract } from '@/types/contract.types'
import type { PartyPolo } from '@/types/legalProcess.types'
import type { OfficeSettings } from '@/types/officeSettings.types'
import { formatDocument } from '@/utils/format'
import {
  catalogEntry,
  type CatalogFieldName,
  type CatalogGroup,
  type CatalogValues,
} from './catalog'
import {
  currencyToWords,
  formatLongDate,
  formatShortDate,
  officeTodayIso,
  percentToWords,
} from './spellOut'
import { joinNames } from './text'

interface ProcessRow {
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  case_value: number | null
  filing_date: string | null
  opposing_counsel: string | null
  parties: Array<{
    name: string
    polo: PartyPolo
    party_type: string | null
    client_id: string | null
    position: number
  }>
}

interface LawyerRow {
  id: string
  full_name: string
  oab_number: string | null
  oab_state: string | null
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** "RECLAMANTE" → "Reclamante" — o tipo de parte vem do tribunal em caixa alta. */
function sentenceCase(value: string): string {
  const lower = value.trim().toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Contato principal; na falta de um marcado, o primeiro; na falta de
 * contatos, as colunas antigas do cliente. */
function primaryContact(
  client: ClientWithRelations,
  type: ClientContact['type'],
): string | undefined {
  const contacts = (client.contacts ?? []).filter(
    (contact) => contact.type === type && contact.value.trim(),
  )
  const contact = contacts.find((item) => item.is_primary) ?? contacts[0]
  return nonEmpty(contact?.value) ?? nonEmpty(type === 'email' ? client.email : client.phone)
}

function clientValues(client: ClientWithRelations): CatalogValues {
  const isCompany = client.type === 'company'
  const address = getPrimaryAddress(client)
  const document = nonEmpty(client.cpf) ?? nonEmpty(client.cnpj)
  const rg = nonEmpty(client.rg)
  return {
    cliente_nome: nonEmpty(isCompany ? client.company_name : client.name),
    cliente_qualificacao: nonEmpty(buildQualificacao(client)),
    cliente_documento: document ? formatDocument(document) : undefined,
    cliente_rg: rg ? [rg, nonEmpty(client.rg_issuer)].filter(Boolean).join(' ') : undefined,
    cliente_estado_civil: formatMaritalStatus(client) ?? undefined,
    cliente_profissao: nonEmpty(client.profession),
    cliente_nacionalidade: nonEmpty(client.nationality),
    cliente_nascimento: client.birth_date
      ? (formatShortDate(client.birth_date) ?? undefined)
      : undefined,
    cliente_email: primaryContact(client, 'email'),
    cliente_telefone: primaryContact(client, 'phone'),
    cliente_endereco: nonEmpty(formatAddressLine(address)),
    cliente_cidade: nonEmpty(address?.city),
    cliente_uf: nonEmpty(address?.state)?.toUpperCase(),
    cliente_cep: nonEmpty(address?.zip),
    cliente_representante: isCompany ? nonEmpty(client.contact_person) : undefined,
  }
}

/** Os números do contrato que os campos `{contrato_*}` usam. */
export type ContractNumbers = Pick<
  Contract,
  | 'total_amount'
  | 'installments'
  | 'first_due_date'
  | 'success_fee_percent'
  | 'start_date'
  | 'end_date'
  | 'adjustment_index'
>

const CONTRACT_NUMBERS_SELECT =
  'total_amount, installments, first_due_date, success_fee_percent, start_date, end_date, ' +
  'adjustment_index'

function isoParts(isoDate: string): [number, number, number] {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return [year, month, day]
}

/**
 * "12 meses" quando início e fim fecham meses inteiros — 01/01 a 31/12, ou
 * 10/03 a 10/09 —, senão "45 dias". Contado no calendário, sem fuso.
 */
export function describeContractTerm(startIso: string, endIso: string): string | undefined {
  const [y1, m1, d1] = isoParts(startIso)
  const [y2, m2, d2] = isoParts(endIso)
  const start = Date.UTC(y1, m1 - 1, d1)
  const end = Date.UTC(y2, m2 - 1, d2)
  if (end < start) return undefined

  const dayAfterEnd = new Date(end + 86_400_000)
  const closesOnDayBefore = dayAfterEnd.getUTCDate() === d1
  if (closesOnDayBefore || d2 === d1) {
    const reference = closesOnDayBefore ? dayAfterEnd : new Date(end)
    const months =
      (reference.getUTCFullYear() - y1) * 12 + (reference.getUTCMonth() - (m1 - 1))
    if (months > 0) return months === 1 ? '1 mês' : `${months} meses`
  }
  const days = Math.round((end - start) / 86_400_000) + 1
  return days === 1 ? '1 dia' : `${days} dias`
}

/** Valores do grupo `contrato` do catálogo, a partir do registro. */
export function contractValues(contract: ContractNumbers): CatalogValues {
  const total = contract.total_amount != null ? Number(contract.total_amount) : null
  const installments = contract.installments
  const each =
    total !== null && installments ? Math.round((total / installments) * 100) / 100 : null
  const fee = contract.success_fee_percent != null ? Number(contract.success_fee_percent) : null

  return {
    contrato_valor: total !== null ? formatCurrency(total) : undefined,
    contrato_valor_extenso: total !== null ? currencyToWords(total) : undefined,
    contrato_parcelas: installments
      ? `${installments} ${installments === 1 ? 'parcela' : 'parcelas'}` +
        (each !== null ? ` de ${formatCurrency(each)}` : '')
      : undefined,
    contrato_parcela_valor: each !== null ? formatCurrency(each) : undefined,
    contrato_primeiro_vencimento: contract.first_due_date
      ? (formatShortDate(contract.first_due_date) ?? undefined)
      : undefined,
    contrato_exito_percentual:
      fee !== null ? `${fee.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : undefined,
    contrato_exito_percentual_extenso: fee !== null ? percentToWords(fee) : undefined,
    contrato_inicio: contract.start_date
      ? (formatShortDate(contract.start_date) ?? undefined)
      : undefined,
    contrato_fim: contract.end_date ? (formatShortDate(contract.end_date) ?? undefined) : undefined,
    contrato_prazo:
      contract.start_date && contract.end_date
        ? describeContractTerm(contract.start_date, contract.end_date)
        : undefined,
    contrato_reajuste: nonEmpty(contract.adjustment_index),
  }
}

/** "Ana Lima (OAB/ES 12345)". Sem OAB cadastrada, só o nome. */
function lawyerLabel(lawyer: LawyerRow): string {
  const number = nonEmpty(lawyer.oab_number)
  if (!number) return lawyer.full_name
  const state = nonEmpty(lawyer.oab_state)
  return `${lawyer.full_name} (OAB${state ? `/${state}` : ''} ${number})`
}

async function fetchClient(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*, addresses:client_addresses(*), contacts:client_contacts(*)')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ClientWithRelations | null) ?? null
}

async function fetchProcess(supabase: SupabaseClient, processId: string) {
  const { data, error } = await supabase
    .from('legal_processes')
    .select(
      'cnj_number, court, court_division, comarca, procedural_class, subject, case_value, ' +
        'filing_date, opposing_counsel, ' +
        'parties:legal_process_parties(name, polo, party_type, client_id, position)',
    )
    .eq('id', processId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ProcessRow | null) ?? null
}

async function fetchContract(supabase: SupabaseClient, contractId: string) {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_NUMBERS_SELECT)
    .eq('id', contractId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ContractNumbers | null) ?? null
}

async function fetchLawyers(supabase: SupabaseClient, lawyerIds: readonly string[]) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, oab_number, oab_state')
    .in('id', [...lawyerIds])
  if (error) throw error
  const rows = (data ?? []) as LawyerRow[]
  // A ordem é a da escolha: o primeiro é quem assina (`{advogado_nome}`).
  return lawyerIds.flatMap((id) => rows.filter((row) => row.id === id))
}

/**
 * Dados do escritório. Falha aqui não derruba o documento: sem eles só os
 * campos `{escritorio_*}` ficam em branco, e o aviso diz por quê.
 */
async function fetchOffice(
  supabase: SupabaseClient,
): Promise<{ office: OfficeSettings | null; failed: boolean }> {
  const { data, error } = await supabase.from('office_settings').select('*').maybeSingle()
  if (error) {
    console.error('[modelos] leitura de office_settings falhou:', error.code, error.message)
    return { office: null, failed: true }
  }
  return { office: (data as OfficeSettings | null) ?? null, failed: false }
}

/**
 * Cliente de um processo: o dono do card mestre (`wf-processos`), que é o
 * vínculo que a tela do cliente usa; sem dono, a única parte vinculada a um
 * cliente. Com mais de uma, não dá para adivinhar — volta null e quem gera
 * escolhe.
 *
 * Só conta parte ligada a CLIENTE (migration 78): a parte contrária
 * cadastrada como pessoa também tem `client_id`, e sem o filtro a petição
 * sairia com a qualificação dela nos campos `{cliente_*}`.
 */
export async function getProcessClientId(
  supabase: SupabaseClient,
  processId: string,
): Promise<string | null> {
  const { data: owner, error } = await supabase
    .from('crm_items')
    .select('client_id')
    .eq('legal_process_id', processId)
    .eq('workflow_id', 'wf-processos')
    .not('client_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (owner?.client_id) return owner.client_id as string

  const { data: parties, error: partiesError } = await supabase
    .from('legal_process_parties')
    .select('client_id, client:clients!inner(is_client)')
    .eq('legal_process_id', processId)
    .eq('client.is_client', true)
  if (partiesError) throw partiesError
  const clientIds = [...new Set((parties ?? []).map((party) => party.client_id as string))]
  return clientIds.length === 1 ? clientIds[0] : null
}

export interface ResolveTemplateFieldsInput {
  /** Campos de cadastro que o modelo usa — só eles são consultados. */
  fields: readonly CatalogFieldName[]
  clientId: string | null
  processId: string | null
  /** Contrato de onde saem os campos `{contrato_*}`. Fora de um contrato,
   * eles ficam em branco. */
  contractId?: string | null
  /** Na ordem da escolha; o primeiro é o de `{advogado_nome}`. */
  lawyerIds: readonly string[]
  now: Date
}

/**
 * Valores dos campos de CADASTRO que o modelo usa, lidos do banco com o client
 * de quem pede (RLS) — o do navegador na tela, o do servidor no Assistente.
 *
 * Valor ausente fica `undefined` — o preenchimento transforma isso em
 * `[FALTA: campo]` no documento. `notes` explica os buracos que não são só
 * "cadastro incompleto" (nada escolhido, cliente fora do processo, escritório
 * sem cadastro).
 */
export async function resolveTemplateFields(
  supabase: SupabaseClient,
  { fields, clientId, processId, contractId = null, lawyerIds, now }: ResolveTemplateFieldsInput,
): Promise<{ values: CatalogValues; notes: string[] }> {
  const values: CatalogValues = {}
  const notes: string[] = []
  const wants = (field: CatalogFieldName) => fields.includes(field)
  const wantsGroup = (group: CatalogGroup, except: CatalogFieldName[] = []) =>
    fields.some((field) => catalogEntry(field).group === group && !except.includes(field))

  const needsClient = wantsGroup('cliente', ['cliente_tipo_parte'])
  const needsProcess = wantsGroup('processo') || wants('cliente_tipo_parte')
  const needsContract = wantsGroup('contrato')
  const needsLawyers = wantsGroup('advogado')
  const needsOffice = wantsGroup('escritorio') || wants('local_e_data')

  const [client, process, contract, lawyers, officeResult] = await Promise.all([
    needsClient && clientId ? fetchClient(supabase, clientId) : null,
    needsProcess && processId ? fetchProcess(supabase, processId) : null,
    needsContract && contractId ? fetchContract(supabase, contractId) : null,
    needsLawyers && lawyerIds.length > 0 ? fetchLawyers(supabase, lawyerIds) : [],
    needsOffice ? fetchOffice(supabase) : null,
  ])

  if (needsContract) {
    if (!contractId) {
      notes.push(
        'Os campos {contrato_*} só se preenchem gerando pelo contrato, em Contratos — ' +
          'aqui ficaram em branco.',
      )
    } else if (!contract) {
      notes.push('Contrato não encontrado ou sem acesso — os campos do contrato ficaram em branco.')
    } else Object.assign(values, contractValues(contract))
  }

  if (needsClient) {
    if (!clientId) notes.push('Nenhum cliente escolhido — os campos do cliente ficaram em branco.')
    else if (!client) {
      notes.push('Cliente não encontrado ou sem acesso — os campos do cliente ficaram em branco.')
    } else Object.assign(values, clientValues(client))
  }

  if (needsProcess) {
    if (!processId) {
      notes.push('Nenhum processo escolhido — os campos do processo ficaram em branco.')
    }
    else if (!process) {
      notes.push('Processo não encontrado ou sem acesso — os campos do processo ficaram em branco.')
    } else {
      values.processo_cnj = nonEmpty(process.cnj_number)
      values.processo_tribunal = nonEmpty(process.court)
      values.processo_vara = nonEmpty(process.court_division)
      values.processo_comarca = nonEmpty(process.comarca)
      values.processo_classe = nonEmpty(process.procedural_class)
      values.processo_assunto = nonEmpty(process.subject)
      if (process.case_value != null) {
        values.processo_valor_causa = formatCurrency(Number(process.case_value))
        values.processo_valor_causa_extenso = currencyToWords(Number(process.case_value))
      }
      values.processo_distribuicao = process.filing_date
        ? (formatShortDate(process.filing_date) ?? undefined)
        : undefined
      values.advogado_contrario = nonEmpty(process.opposing_counsel)

      // A parte contrária e o papel do cliente dependem de que lado ele está.
      // Sem o cliente vinculado a uma parte, não há como saber — adivinhar
      // poderia pôr o próprio cliente como réu.
      const parties = [...(process.parties ?? [])].sort((a, b) => a.position - b.position)
      const clientParty = clientId
        ? parties.find((party) => party.client_id === clientId)
        : undefined
      if (wants('parte_contraria') || wants('cliente_tipo_parte')) {
        if (!clientParty) {
          notes.push(
            'O cliente não está vinculado a nenhuma parte do processo — parte contrária e ' +
              'tipo de parte ficaram em branco.',
          )
        } else {
          const opposing = parties.filter((party) => party.polo !== clientParty.polo)
          values.parte_contraria = nonEmpty(joinNames(opposing.map((party) => party.name)))
          values.cliente_tipo_parte = clientParty.party_type
            ? sentenceCase(clientParty.party_type)
            : undefined
        }
      }
    }
  }

  if (needsLawyers) {
    if (lawyers.length === 0) {
      notes.push('Nenhum advogado escolhido — os campos de advogado ficaram em branco.')
    } else {
      const [first] = lawyers
      values.advogado_nome = nonEmpty(first.full_name)
      values.advogado_oab = nonEmpty(first.oab_number)
      values.advogado_oab_uf = nonEmpty(first.oab_state)
      values.advogados = nonEmpty(joinNames(lawyers.map(lawyerLabel)))
    }
  }

  const office = officeResult?.office ?? null
  if (needsOffice) {
    if (officeResult?.failed) notes.push('Não foi possível ler os dados do escritório.')
    else if (!office) {
      notes.push('Dados do escritório não cadastrados — preencha em Configurações → Geral.')
    }
    if (office) {
      values.escritorio_nome = nonEmpty(office.name)
      values.escritorio_cnpj = office.cnpj ? formatDocument(office.cnpj) : undefined
      values.escritorio_oab = nonEmpty(office.oab_registration)
      values.escritorio_endereco = nonEmpty(formatAddressLine(office))
      values.escritorio_cidade = nonEmpty(office.city)
      values.escritorio_uf = nonEmpty(office.state)
      values.escritorio_telefone = nonEmpty(office.phone)
      values.escritorio_email = nonEmpty(office.email)
    }
  }

  const today = formatLongDate(officeTodayIso(now)) ?? undefined
  values.data_hoje = today
  if (wants('local_e_data')) {
    const city = nonEmpty(office?.city)
    const state = nonEmpty(office?.state)
    if (city && today) values.local_e_data = `${city}${state ? `/${state}` : ''}, ${today}`
    else if (office) {
      notes.push('Cidade do escritório não cadastrada — {local_e_data} ficou em branco.')
    }
  }

  return { values, notes }
}
