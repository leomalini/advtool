import type { SupabaseClient } from '@supabase/supabase-js'
import type { SummaryProcessData } from './summaryInput'

/**
 * Lê tudo o que entra no resumo de um processo, com o client recebido — na
 * rota, o de quem pediu, então a RLS decide o que o modelo vê.
 *
 * `null` quando o processo não existe ou não é visível. Erro de consulta
 * lança: um resumo feito com parte dos dados afirmaria ausências falsas.
 */
export async function loadSummaryData(
  supabase: SupabaseClient,
  legalProcessId: string,
): Promise<SummaryProcessData | null> {
  const [process, movements, publications, hearings, tasks, events] = await Promise.all([
    supabase
      .from('legal_processes')
      .select(
        'cnj_number, court, court_division, comarca, procedural_class, subject, case_value, ' +
          'filing_date, status, plaintiff, defendant, opposing_counsel, ' +
          'parties:legal_process_parties(name, polo, party_type, position)',
      )
      .eq('id', legalProcessId)
      .maybeSingle(),
    supabase
      .from('legal_process_movements')
      .select('id, movement_date, title, description')
      .eq('legal_process_id', legalProcessId),
    supabase
      .from('publications')
      .select('id, publication_date, publication_type, diario_name, title, content_text, excerpt')
      .eq('legal_process_id', legalProcessId),
    supabase
      .from('hearings')
      .select(
        'id, event_id, status, modality, kind:hearing_kinds(label), event:events(start_at, all_day)',
      )
      .eq('legal_process_id', legalProcessId),
    supabase.from('tasks').select('id, title, status, due_date').eq('legal_process_id', legalProcessId),
    supabase.from('events').select('id, title, start_at, all_day').eq('legal_process_id', legalProcessId),
  ])

  for (const result of [process, movements, publications, hearings, tasks, events]) {
    if (result.error) throw result.error
  }
  if (!process.data) return null

  const hearingRows = (hearings.data ?? []) as unknown as (SummaryProcessData['hearings'][number] & {
    event_id: string | null
  })[]
  // Audiência já tem compromisso próprio na agenda: entra uma vez, como audiência.
  const hearingEventIds = new Set(hearingRows.map((hearing) => hearing.event_id).filter(Boolean))

  return {
    process: process.data as unknown as SummaryProcessData['process'],
    movements: (movements.data ?? []) as SummaryProcessData['movements'],
    publications: (publications.data ?? []) as SummaryProcessData['publications'],
    hearings: hearingRows,
    tasks: (tasks.data ?? []) as SummaryProcessData['tasks'],
    events: ((events.data ?? []) as SummaryProcessData['events']).filter(
      (event) => !hearingEventIds.has(event.id),
    ),
  }
}
