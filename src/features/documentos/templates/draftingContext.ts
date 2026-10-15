import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilePart, TextPart } from 'ai'
import { readDocumentsAsParts, type ReadableDocument } from '@/features/ia/files/documentParts'
import { clientLabel } from '@/features/ia/tools/shared'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/document.types'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { formatCurrency } from '@/types/financialEntry.types'
import type { PartyPolo } from '@/types/legalProcess.types'
import type { AiFieldDefinition } from './fieldSettings'
import { formatShortDate } from './spellOut'
import { joinNames } from './text'

/**
 * O que a IA recebe para redigir os campos de texto de um modelo — SÓ
 * SERVIDOR (lê arquivos com `mammoth`/`exceljs`).
 *
 * Mínimo de propósito: nomes, dados do processo e o andamento recente. CPF,
 * RG e endereço não vão — a IA não precisa deles para narrar os fatos, e o
 * sistema os preenche depois pelos campos de cadastro. No plano gratuito do
 * Gemini o conteúdo enviado pode ser usado pelo Google; dado que não sai não
 * vaza.
 */

/** Movimentações recentes: o suficiente para situar a peça. */
const MAX_MOVEMENTS = 10
const MAX_MOVEMENT_CHARS = 300

interface ProcessRow {
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  case_value: number | null
  filing_date: string | null
  parties: Array<{
    name: string
    polo: PartyPolo
    party_type: string | null
    client_id: string | null
    position: number
  }>
}

interface MovementRow {
  movement_date: string
  title: string | null
  description: string
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

async function describeClient(supabase: SupabaseClient, clientId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('type, name, company_name, trade_name')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  if (!data) return ['- Cliente: não encontrado ou sem acesso.']
  const kind = data.type === 'company' ? 'pessoa jurídica' : 'pessoa física'
  const name = data.type === 'company' ? data.company_name : clientLabel(data)
  return [`- Cliente: ${name ?? '(sem nome)'} (${kind})`]
}

async function describeProcess(
  supabase: SupabaseClient,
  processId: string,
  clientId: string | null,
): Promise<string[]> {
  const [{ data, error }, { data: movements, error: movementsError }] = await Promise.all([
    supabase
      .from('legal_processes')
      .select(
        'cnj_number, court, court_division, comarca, procedural_class, subject, case_value, ' +
          'filing_date, parties:legal_process_parties(name, polo, party_type, client_id, position)',
      )
      .eq('id', processId)
      .maybeSingle(),
    supabase
      .from('legal_process_movements')
      .select('movement_date, title, description')
      .eq('legal_process_id', processId)
      .order('movement_date', { ascending: false })
      .limit(MAX_MOVEMENTS),
  ])
  if (error) throw error
  if (movementsError) throw movementsError
  if (!data) return ['- Processo: não encontrado ou sem acesso.']

  const process = data as unknown as ProcessRow
  const lines = [
    `- Processo: ${process.cnj_number ?? 'sem número'}`,
    ...[
      ['Tribunal', process.court],
      ['Vara/órgão', process.court_division],
      ['Comarca', process.comarca],
      ['Classe', process.procedural_class],
      ['Assunto', process.subject],
      [
        'Valor da causa',
        process.case_value != null ? formatCurrency(Number(process.case_value)) : null,
      ],
      ['Distribuição', process.filing_date ? formatShortDate(process.filing_date) : null],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `  - ${label}: ${value}`),
  ]

  const parties = [...(process.parties ?? [])].sort((a, b) => a.position - b.position)
  const byPolo = (polo: PartyPolo) =>
    joinNames(parties.filter((party) => party.polo === polo).map((party) => party.name))
  if (parties.length > 0) {
    lines.push(
      `  - Polo ativo: ${byPolo('ativo') || '—'}`,
      `  - Polo passivo: ${byPolo('passivo') || '—'}`,
    )
  }
  const clientParty = clientId ? parties.find((party) => party.client_id === clientId) : undefined
  if (clientParty) {
    const role = clientParty.party_type ? `${clientParty.party_type}, ` : ''
    lines.push(`  - O cliente é ${clientParty.name} (${role}polo ${clientParty.polo})`)
  }

  const recent = (movements ?? []) as MovementRow[]
  if (recent.length > 0) {
    lines.push('  - Andamento recente (mais novo primeiro):')
    for (const movement of recent) {
      const date = formatShortDate(movement.movement_date) ?? movement.movement_date
      const summary = clip(movement.title || movement.description, MAX_MOVEMENT_CHARS)
      lines.push(`    - ${date}: ${summary}`)
    }
  }
  return lines
}

/** Os documentos escolhidos, como o modelo os lê — ver `documentParts.ts`. */
async function readDocuments(
  supabase: SupabaseClient,
  documentIds: readonly string[],
): Promise<{ parts: Array<TextPart | FilePart>; skipped: string[] }> {
  if (documentIds.length === 0) return { parts: [], skipped: [] }

  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name, file_path, file_size')
    .in('id', [...documentIds])
  if (error) throw error

  const { parts, skipped } = await readDocumentsAsParts(
    supabase,
    (data ?? []) as ReadableDocument[],
    (document) => `Documento: ${document.file_name}`,
  )
  return { parts, skipped }
}

/** A mensagem do usuário para o modelo: o pedido, o contexto e os documentos. */
export async function buildDraftingMessage(
  supabase: SupabaseClient,
  {
    template,
    fields,
    clientId,
    processId,
    notes,
    documentIds,
  }: {
    template: Pick<DocumentTemplate, 'name' | 'description' | 'category'>
    fields: readonly AiFieldDefinition[]
    clientId: string | null
    processId: string | null
    notes: string
    documentIds: readonly string[]
  },
): Promise<{ content: Array<TextPart | FilePart>; skipped: string[] }> {
  const [clientLines, processLines, documents] = await Promise.all([
    clientId ? describeClient(supabase, clientId) : Promise.resolve(['- Cliente: não informado.']),
    processId
      ? describeProcess(supabase, processId, clientId)
      : Promise.resolve(['- Processo: não informado.']),
    readDocuments(supabase, documentIds),
  ])

  const header = [
    `Documento: ${template.name} (${DOCUMENT_CATEGORY_LABELS[template.category]})`,
    template.description ? `Quando se usa: ${template.description}` : null,
    '',
    'Campos a redigir:',
    ...fields.map(
      (field) =>
        `- ${field.name} (${field.label}): ` +
        (field.instruction.trim() || 'sem instrução — deduza pelo nome'),
    ),
    '',
    'Partes e processo:',
    ...clientLines,
    ...processLines,
    '',
    'Anotações do advogado:',
    notes.trim() || '(nenhuma)',
  ]
    .filter((line) => line !== null)
    .join('\n')

  return {
    content: [{ type: 'text', text: header }, ...documents.parts],
    skipped: documents.skipped,
  }
}
