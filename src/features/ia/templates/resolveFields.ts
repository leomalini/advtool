import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildQualificacao,
  formatAddressLine,
  getPrimaryAddress,
} from '@/features/clientes/utils/qualificacao'
import { formatCurrency } from '@/types/financialEntry.types'
import type { ClientWithRelations } from '@/types/cliente.types'
import type { PartyPolo } from '@/types/legalProcess.types'
import { formatDocument } from '@/utils/format'
import type { TemplateFieldName } from './catalog'

type FieldValues = Partial<Record<TemplateFieldName, string>>

interface ProcessRow {
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  case_value: number | null
  parties: Array<{ name: string; polo: PartyPolo; client_id: string | null; position: number }>
}

/** "A", "A e B", "A, B e C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Valores dos campos de CADASTRO que o modelo usa, lidos do banco com o client
 * de quem pede (RLS). Só consulta o que o modelo precisa.
 *
 * Valor ausente fica `undefined` — o preenchimento transforma isso em
 * `[FALTA: campo]` no documento. `notes` explica os buracos que não são só
 * "cadastro incompleto" (cliente fora do processo, processo não informado).
 */
export async function resolveTemplateFields(
  supabase: SupabaseClient,
  {
    fields,
    clientId,
    processId,
    userId,
    now,
  }: {
    fields: readonly TemplateFieldName[]
    clientId: string
    processId: string | null
    userId: string
    now: Date
  },
): Promise<{ values: FieldValues; notes: string[] }> {
  const values: FieldValues = {}
  const notes: string[] = []
  const wants = (prefix: string) => fields.some((field) => field.startsWith(prefix))

  if (wants('cliente_')) {
    const { data, error } = await supabase
      .from('clients')
      .select('*, addresses:client_addresses(*)')
      .eq('id', clientId)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      notes.push('Cliente não encontrado ou sem acesso — campos do cliente ficaram em branco.')
    } else {
      const client = data as unknown as ClientWithRelations
      values.cliente_nome = nonEmpty(client.type === 'company' ? client.company_name : client.name)
      values.cliente_qualificacao = nonEmpty(buildQualificacao(client))
      const document = nonEmpty(client.cpf) ?? nonEmpty(client.cnpj)
      values.cliente_documento = document ? formatDocument(document) : undefined
      values.cliente_endereco = nonEmpty(formatAddressLine(getPrimaryAddress(client)))
    }
  }

  if (wants('processo_') || fields.includes('parte_contraria')) {
    if (!processId) {
      notes.push('Nenhum processo informado — campos do processo ficaram em branco.')
    } else {
      const { data, error } = await supabase
        .from('legal_processes')
        .select(
          'cnj_number, court, court_division, comarca, procedural_class, subject, case_value, ' +
            'parties:legal_process_parties(name, polo, client_id, position)',
        )
        .eq('id', processId)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        notes.push('Processo não encontrado ou sem acesso — campos do processo ficaram em branco.')
      } else {
        const process = data as unknown as ProcessRow
        values.processo_cnj = nonEmpty(process.cnj_number)
        values.processo_tribunal = nonEmpty(process.court)
        values.processo_vara = nonEmpty(process.court_division)
        values.processo_comarca = nonEmpty(process.comarca)
        values.processo_classe = nonEmpty(process.procedural_class)
        values.processo_assunto = nonEmpty(process.subject)
        values.processo_valor_causa =
          process.case_value != null ? formatCurrency(Number(process.case_value)) : undefined

        if (fields.includes('parte_contraria')) {
          // A parte contrária depende de que lado o cliente está. Sem o cliente
          // vinculado a uma parte, não há como saber — adivinhar poderia pôr o
          // próprio cliente como réu.
          const parties = [...(process.parties ?? [])].sort((a, b) => a.position - b.position)
          const clientPolo = parties.find((party) => party.client_id === clientId)?.polo
          if (!clientPolo) {
            notes.push(
              'O cliente não está vinculado a nenhuma parte do processo — parte_contraria ficou em branco.',
            )
          } else {
            values.parte_contraria = nonEmpty(
              joinNames(parties.filter((party) => party.polo !== clientPolo).map((party) => party.name)),
            )
          }
        }
      }
    }
  }

  if (wants('advogado_')) {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, oab_number')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    values.advogado_nome = nonEmpty(data?.full_name as string | null | undefined)
    values.advogado_oab = nonEmpty(data?.oab_number as string | null | undefined)
  }

  if (fields.includes('data_hoje')) {
    values.data_hoje = new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(now)
  }

  return { values, notes }
}
