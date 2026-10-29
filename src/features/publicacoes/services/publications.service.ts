import { createClient } from '@/lib/supabase/client'
import type {
  PublicationWithRelations,
  PublicationFilters,
} from '@/types/publication.types'

const supabase = createClient()

const PUBLICATION_SELECT = `
  *,
  parties:publication_parties(*),
  legal_process:legal_processes(
    id, cnj_number, court, plaintiff, defendant,
    parties:legal_process_parties(id, name, polo, party_type, position)
  ),
  triage:publication_triage(
    *,
    probable_process:legal_processes!publication_triage_probable_process_id_fkey(id, cnj_number)
  )
`

/** Defensivo como em processos: consumidores iteram sem checar. A triagem é
 * um-para-um (a chave é a publicação), mas o embed pode vir como lista. */
function normalize(row: Record<string, unknown>): PublicationWithRelations {
  const triage = Array.isArray(row.triage) ? (row.triage[0] ?? null) : (row.triage ?? null)
  return {
    ...(row as unknown as PublicationWithRelations),
    parties: (row.parties as PublicationWithRelations['parties']) ?? [],
    legal_process: (row.legal_process as PublicationWithRelations['legal_process']) ?? null,
    triage: triage as PublicationWithRelations['triage'],
  }
}

export async function getPublications(
  filters: PublicationFilters = {},
): Promise<PublicationWithRelations[]> {
  let query = supabase
    .from('publications')
    .select(PUBLICATION_SELECT)
    // A mesma publicação chega por até três portas (cadastro do processo,
    // busca por OAB, webhook). A que entrou primeiro representa as demais.
    .is('duplicate_of_id', null)
    // Mais recente primeiro; o sequencial desempata publicações do mesmo dia,
    // que é o caso comum — um diário inteiro entra com a mesma data.
    .order('publication_date', { ascending: false })
    .order('sequence_number', { ascending: false })

  if (filters.onlyUnread) query = query.is('read_at', null)
  if (filters.onlyOrphans) query = query.is('legal_process_id', null)
  if (filters.court) query = query.eq('court', filters.court)

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    query = query.or(
      `title.ilike.${term},content_text.ilike.${term},cnj_number.ilike.${term}`,
    )
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => normalize(row as Record<string, unknown>))
}

export async function getPublicationById(id: string): Promise<PublicationWithRelations | null> {
  const { data, error } = await supabase
    .from('publications')
    .select(PUBLICATION_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data ? normalize(data as Record<string, unknown>) : null
}

/**
 * Ids da fila, na mesma ordem da listagem.
 *
 * A tela de detalhe precisa saber quem vem antes e depois para os botões de
 * navegação — e precisa disso sem carregar o conteúdo integral de centenas de
 * publicações, daí a consulta enxuta.
 */
export async function getPublicationQueue(onlyUnread: boolean): Promise<string[]> {
  let query = supabase
    .from('publications')
    .select('id')
    .is('duplicate_of_id', null)
    .order('publication_date', { ascending: false })
    .order('sequence_number', { ascending: false })

  if (onlyUnread) query = query.is('read_at', null)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => row.id as string)
}

export async function countUnreadPublications(): Promise<number> {
  const { count, error } = await supabase
    .from('publications')
    .select('id', { count: 'exact', head: true })
    .is('duplicate_of_id', null)
    .is('read_at', null)

  if (error) throw error
  return count ?? 0
}

/** Marca como lida. Idempotente: reabrir não reescreve o carimbo original. */
export async function markPublicationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('publications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  if (error) throw error
}

/** Desfaz o "marcar como lida": a publicação volta para a fila. Só a que não
 * foi tratada — tratar implica lida, e desfazer a leitura não pode desfazer o
 * tratamento junto. */
export async function markPublicationUnread(id: string): Promise<void> {
  const { error } = await supabase
    .from('publications')
    .update({ read_at: null })
    .eq('id', id)
    .is('handled_at', null)

  if (error) throw error
}

/** Alterna "tratada". Tratar implica lida — não dá para resolver o que não leu. */
export async function setPublicationHandled(id: string, handled: boolean): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('publications')
    .update(
      handled
        ? { handled_at: now, read_at: now }
        : { handled_at: null },
    )
    .eq('id', id)

  if (error) throw error
}

/** Tipo e assunto são nossos: a API não os fornece. */
export async function updatePublicationFields(
  id: string,
  patch: { publication_type?: string | null; subject?: string | null },
): Promise<void> {
  const { error } = await supabase.from('publications').update(patch).eq('id', id)
  if (error) throw error
}

/** A sugestão de tarefa da triagem (fase 5): virou tarefa ou foi descartada. */
export async function updateTriageSuggestion(
  publicationId: string,
  patch: { suggestion_status: 'task_created' | 'dismissed'; task_id?: string },
): Promise<void> {
  const { error } = await supabase
    .from('publication_triage')
    .update(patch)
    .eq('publication_id', publicationId)
  if (error) throw error
}

/** Liga uma publicação a um processo já cadastrado, escolhido por alguém —
 * inclusive de outro CNJ (recurso, incidente). */
export async function linkPublicationToProcess(
  publicationId: string,
  legalProcessId: string,
): Promise<void> {
  const { error } = await supabase
    .from('publications')
    .update({ legal_process_id: legalProcessId })
    .eq('id', publicationId)
  if (error) throw error
}

/**
 * Liga as publicações órfãs ao processo recém-cadastrado.
 *
 * Chamado depois de criar o processo a partir de uma publicação: outras
 * publicações do mesmo CNJ, que entraram antes, também passam a apontar para
 * ele.
 */
export async function linkPublicationsToProcess(
  cnjNumber: string,
  legalProcessId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('publications')
    .update({ legal_process_id: legalProcessId })
    .eq('cnj_number', cnjNumber)
    .is('legal_process_id', null)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}
