import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TRIAGE_PROMPT_VERSION } from './triagePrompt'

/** Texto de diário passa disso raramente; o resto não muda a triagem. */
const MAX_TEXT_CHARS = 24_000

/** Candidatos a processo provável, achados pelos destinatários. */
const MAX_CANDIDATES = 5

interface PartyRow {
  name: string
  polo?: string
  role?: string
}

interface ProcessSummaryRow {
  id: string
  cnj_number: string | null
  procedural_class: string | null
  subject: string | null
  parties: PartyRow[]
}

export interface TriageData {
  publication: {
    id: string
    sequence_number: number
    publication_date: string
    court: string | null
    diario_name: string | null
    cnj_number: string | null
    title: string | null
    content_text: string | null
    legal_process_id: string | null
  }
  parties: PartyRow[]
  linkedProcess: ProcessSummaryRow | null
  candidates: ProcessSummaryRow[]
}

const PROCESS_COLUMNS =
  'id, cnj_number, procedural_class, subject, parties:legal_process_parties(name, polo)'

/**
 * O que a triagem lê de uma publicação: o texto, as partes, o processo ligado
 * — ou, sem processo, os candidatos que têm parte com o mesmo nome de um
 * destinatário. `null` para publicação que não existe ou é duplicata (a
 * sobrevivente é que se tria).
 */
export async function loadTriageData(
  admin: SupabaseClient,
  publicationId: string,
): Promise<TriageData | null> {
  const { data: publication, error } = await admin
    .from('publications')
    .select(
      'id, sequence_number, publication_date, court, diario_name, cnj_number, title, ' +
        'content_text, legal_process_id, duplicate_of_id',
    )
    .eq('id', publicationId)
    .maybeSingle()
  if (error) throw error
  const row = publication as unknown as (TriageData['publication'] & { duplicate_of_id: string | null }) | null
  if (!row || row.duplicate_of_id) return null

  const { data: parties, error: partiesError } = await admin
    .from('publication_parties')
    .select('name, role')
    .eq('publication_id', publicationId)
    .order('position')
  if (partiesError) throw partiesError
  const partyRows = (parties ?? []) as PartyRow[]

  let linkedProcess: ProcessSummaryRow | null = null
  let candidates: ProcessSummaryRow[] = []
  if (row.legal_process_id) {
    const { data, error: processError } = await admin
      .from('legal_processes')
      .select(PROCESS_COLUMNS)
      .eq('id', row.legal_process_id)
      .maybeSingle()
    if (processError) throw processError
    linkedProcess = (data as unknown as ProcessSummaryRow | null) ?? null
  } else {
    // Mesmo nome, sem diferença de maiúsculas: `ilike` sem curinga. Nome
    // parecido daria candidato demais.
    const names = partyRows
      .filter((party) => party.role === 'destinatario')
      .map((party) => party.name.replace(/[%_]/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 4)
    const ids = new Set<string>()
    for (const name of names) {
      const { data, error: matchError } = await admin
        .from('legal_process_parties')
        .select('legal_process_id')
        .ilike('name', name)
        .limit(MAX_CANDIDATES)
      if (matchError) throw matchError
      for (const match of data ?? []) ids.add(match.legal_process_id as string)
    }
    if (ids.size > 0) {
      const { data, error: candidatesError } = await admin
        .from('legal_processes')
        .select(PROCESS_COLUMNS)
        .in('id', [...ids].slice(0, MAX_CANDIDATES))
      if (candidatesError) throw candidatesError
      candidates = (data ?? []) as unknown as ProcessSummaryRow[]
    }
  }

  return { publication: row, parties: partyRows, linkedProcess, candidates }
}

/** Muda quando muda o que o modelo lê — ou a versão das instruções. */
export function triageHash(data: TriageData): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: TRIAGE_PROMPT_VERSION,
        text: data.publication.content_text,
        process: data.publication.legal_process_id,
        candidates: data.candidates.map((candidate) => candidate.id).sort(),
      }),
    )
    .digest('hex')
}

function describeProcess(process: ProcessSummaryRow): string {
  const parties = process.parties
    .map((party) => `${party.name}${party.polo ? ` (${party.polo})` : ''}`)
    .join('; ')
  return [
    `CNJ: ${process.cnj_number ?? 'sem número'}`,
    process.procedural_class ? `Classe: ${process.procedural_class}` : null,
    process.subject ? `Assunto: ${process.subject}` : null,
    parties ? `Partes: ${parties}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** A mensagem do pedido: a publicação e, conforme o caso, o processo ou os candidatos. */
export function buildTriageInput(data: TriageData): string {
  const { publication } = data
  const date = publication.publication_date.slice(0, 10).split('-').reverse().join('/')
  const text = (publication.content_text ?? '').trim()
  const parties = data.parties.map((party) => `${party.name} (${party.role ?? 'parte'})`).join('; ')

  const blocks = [
    '<publicacao>',
    `Número no AdvTool: #${publication.sequence_number}`,
    `Data de publicação: ${date}`,
    publication.court ? `Tribunal: ${publication.court}` : null,
    publication.diario_name ? `Diário: ${publication.diario_name}` : null,
    `CNJ: ${publication.cnj_number ?? 'não informado'}`,
    publication.title ? `Título: ${publication.title}` : null,
    parties ? `Partes: ${parties}` : null,
    'Texto:',
    text ? text.slice(0, MAX_TEXT_CHARS) : '[sem texto]',
    '</publicacao>',
  ]

  if (data.linkedProcess) {
    blocks.push('<processo_vinculado>', describeProcess(data.linkedProcess), '</processo_vinculado>')
  } else if (data.candidates.length > 0) {
    blocks.push('<processos_candidatos>')
    for (const candidate of data.candidates) {
      blocks.push(`id: ${candidate.id}\n${describeProcess(candidate)}\n`)
    }
    blocks.push('</processos_candidatos>')
  } else {
    blocks.push('A publicação não está ligada a processo cadastrado, e nenhum processo tem parte com o mesmo nome.')
  }

  return blocks.filter((line): line is string => line !== null).join('\n')
}
