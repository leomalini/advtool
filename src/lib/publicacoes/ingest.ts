// Server-side. Recebe `SupabaseClient` de quem chama — sessão nas rotas de
// tela, service_role no webhook (que não tem sessão).
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicationFingerprint, isSamePublication } from './fingerprint'

/**
 * O único ponto por onde uma publicação entra na base.
 *
 * Existe porque havia três: `syncIntimacoes` (busca por OAB), o
 * `savePublicacoesFromMovimentacoes` do cadastro/sincronização de processo, e
 * agora o webhook. Cada um derivava um `external_id` próprio para a MESMA
 * publicação, então o índice único `(source, external_id)` da migration 44 só
 * impedia repetição dentro da mesma fonte — cadastrar um processo e depois
 * clicar em "Buscar publicações" duplicava a fila inteira.
 *
 * A deduplicação aqui é por conteúdo (ver `fingerprint.ts`), com janela de
 * datas. A verificação e o insert não são atômicos: duas ingestões do mesmo
 * item no mesmo instante ainda podem passar as duas. É deliberado — o preço de
 * uma trava seria pagá-la em toda importação, e o pior caso desta escolha é uma
 * duplicata visível, nunca uma publicação perdida.
 */

/**
 * Destinatário ou advogado da publicação (`public.publication_parties`).
 *
 * Só o webhook de diário informa isso — `/v1/intimacoes` não traz destinatário,
 * como o comentário em `publication.types.ts` já registrava. Por isso é
 * opcional na linha.
 */
export interface PublicationIngestParty {
  name: string
  role: 'destinatario' | 'advogado'
  oab: string | null
  position: number
}

/** Espelha as colunas de `public.publications` que a ingestão preenche. */
export interface PublicationIngestRow {
  legal_process_id: string | null
  cnj_number: string | null
  source: 'busca_processos' | 'manual'
  external_id: string | null
  publication_date: string | null
  court?: string | null
  diario_name?: string | null
  diario_sigla?: string | null
  oab_state?: string | null
  oab_number?: string | null
  availability_date?: string | null
  deadline_start_at?: string | null
  publication_type?: string | null
  title?: string | null
  excerpt?: string | null
  content_html?: string | null
  content_text?: string | null
  subject?: string | null
  external_url?: string | null
  raw_data?: unknown
  /** NÃO é coluna de `publications`: vai para a tabela filha depois do insert. */
  parties?: PublicationIngestParty[]
}

export type PublicationIngestAction =
  /** Linha nova (ou que seria criada, em `dryRun`). */
  | 'inserted'
  /** Mesmo conteúdo, dentro da janela de datas — veio por outra fonte. */
  | 'duplicate'
  /** Mesma fonte e mesmo `external_id`: reimportação do mesmo item. */
  | 'existing_source'
  /** Faltou o mínimo para gravar. */
  | 'invalid'

export interface PublicationIngestOutcome {
  action: PublicationIngestAction
  fingerprint: string | null
  /** Id gravado, ou o da linha que já existia. Null em `dryRun` e em 'invalid'. */
  publicationId: string | null
  cnjNumber: string | null
  title: string | null
  reason?: string
}

export interface PublicationIngestResult {
  inserted: number
  duplicates: number
  outcomes: PublicationIngestOutcome[]
}

export interface PublicationIngestOptions {
  /** Não grava nada; os `outcomes` dizem o que teria acontecido. */
  dryRun?: boolean
  /** Cria o aviso do sino para cada publicação nova. Ligado só no webhook: o
   * sync manual já mostra a contagem num toast, e avisar de novo seria ruído. */
  notify?: boolean
  /** Vai para `notifications.source`: 'webhook' | 'sync' | 'cadastro'. */
  notificationSource?: string
}

interface ExistingRow {
  id: string
  content_fingerprint: string | null
  publication_date: string | null
  duplicate_of_id: string | null
  source: string
  external_id: string | null
}

interface Prepared {
  row: PublicationIngestRow
  fingerprint: string | null
}

interface InsertedRow {
  id: string
  source: string
  external_id: string | null
  content_fingerprint: string | null
}

const LOOKUP_CHUNK = 200

const EXISTING_COLUMNS =
  'id, content_fingerprint, publication_date, duplicate_of_id, source, external_id'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function ingestPublications(
  supabase: SupabaseClient,
  rows: PublicationIngestRow[],
  options: PublicationIngestOptions = {},
): Promise<PublicationIngestResult> {
  const result: PublicationIngestResult = { inserted: 0, duplicates: 0, outcomes: [] }
  if (rows.length === 0) return result

  const prepared: Prepared[] = await Promise.all(
    rows.map(async (row) => ({
      row,
      fingerprint: await publicationFingerprint({
        cnjNumber: row.cnj_number,
        contentText: row.content_text,
      }),
    })),
  )

  const existing = await loadExisting(supabase, prepared)

  // Aceitas até agora NESTE lote. Um lote pode trazer a mesma publicação duas
  // vezes — a API repete o item quando ele aparece em dois diários.
  const accepted: { prepared: Prepared; outcomeIndex: number }[] = []

  for (const item of prepared) {
    const { row, fingerprint } = item
    const outcomeIndex = result.outcomes.length

    const base = {
      fingerprint,
      cnjNumber: row.cnj_number,
      title: row.title ?? null,
    }

    if (!row.publication_date) {
      result.outcomes.push({
        ...base,
        action: 'invalid',
        publicationId: null,
        reason: 'Publicação sem data — a coluna publication_date é obrigatória.',
      })
      continue
    }

    const sameSource = row.external_id
      ? existing.bySourceExternal.get(`${row.source} ${row.external_id}`)
      : undefined

    if (sameSource) {
      result.duplicates++
      result.outcomes.push({
        ...base,
        action: 'existing_source',
        publicationId: rootIdOf(sameSource),
        reason: 'Já importada desta mesma fonte.',
      })
      continue
    }

    const twin = (existing.byFingerprint.get(fingerprint ?? '') ?? []).find((candidate) =>
      isSamePublication(
        { fingerprint, publicationDate: row.publication_date },
        {
          fingerprint: candidate.content_fingerprint,
          publicationDate: candidate.publication_date,
        },
      ),
    )

    if (twin) {
      result.duplicates++
      result.outcomes.push({
        ...base,
        action: 'duplicate',
        publicationId: rootIdOf(twin),
        reason: 'Mesmo conteúdo já registrado por outra fonte.',
      })
      continue
    }

    const twinInBatch = accepted.find(({ prepared: other }) =>
      isSamePublication(
        { fingerprint, publicationDate: row.publication_date },
        { fingerprint: other.fingerprint, publicationDate: other.row.publication_date },
      ),
    )

    if (twinInBatch) {
      result.duplicates++
      result.outcomes.push({
        ...base,
        action: 'duplicate',
        // Resolvido depois do insert: a gêmea deste lote ainda não tem id.
        publicationId: null,
        reason: 'Repetida dentro do próprio lote.',
      })
      continue
    }

    result.outcomes.push({ ...base, action: 'inserted', publicationId: null })
    accepted.push({ prepared: item, outcomeIndex })
  }

  result.inserted = accepted.length

  if (options.dryRun || accepted.length === 0) return result

  const insertedRows = await insertRows(
    supabase,
    accepted.map(({ prepared: item }) => toColumns(item.row, item.fingerprint)),
  )

  // Casa o que voltou do banco com o que foi enviado. `external_id` é a chave
  // preferida porque é única por fonte; o fingerprint cobre quem não tem um.
  const byExternal = new Map<string, string>()
  const byFingerprint = new Map<string, string>()
  for (const row of insertedRows) {
    if (row.external_id) byExternal.set(`${row.source} ${row.external_id}`, row.id)
    if (row.content_fingerprint) byFingerprint.set(row.content_fingerprint, row.id)
  }

  for (const { prepared: item, outcomeIndex } of accepted) {
    const id =
      (item.row.external_id
        ? byExternal.get(`${item.row.source} ${item.row.external_id}`)
        : undefined) ??
      (item.fingerprint ? byFingerprint.get(item.fingerprint) : undefined) ??
      null

    result.outcomes[outcomeIndex].publicationId = id

    // `ignoreDuplicates` engoliu a linha: outra ingestão gravou o mesmo item
    // entre a consulta e o insert. É a corrida descrita no cabeçalho.
    if (!id) {
      result.outcomes[outcomeIndex].action = 'existing_source'
      result.outcomes[outcomeIndex].reason = 'Gravada por outra ingestão simultânea.'
      result.inserted--
      result.duplicates++
    }
  }

  // Duplicata interna do lote passa a apontar para a irmã que foi gravada.
  for (const outcome of result.outcomes) {
    if (outcome.action !== 'duplicate' || outcome.publicationId) continue
    if (!outcome.fingerprint) continue
    outcome.publicationId = byFingerprint.get(outcome.fingerprint) ?? null
  }

  await saveParties(
    supabase,
    accepted.map(({ prepared: item, outcomeIndex }) => ({
      publicationId: result.outcomes[outcomeIndex].publicationId,
      parties: item.row.parties ?? [],
    })),
  )

  if (options.notify) {
    await notifyInserted(supabase, result.outcomes, options.notificationSource ?? 'webhook')
  }

  return result
}

/**
 * Destinatários e advogados das publicações recém-gravadas.
 *
 * Só para as novas: numa duplicata a linha original já tem as suas, e
 * reinserir criaria a mesma parte duas vezes — `publication_parties` não tem
 * chave única, porque a mesma pessoa pode aparecer em papéis diferentes.
 */
async function saveParties(
  supabase: SupabaseClient,
  entries: { publicationId: string | null; parties: PublicationIngestParty[] }[],
): Promise<void> {
  const rows = entries
    .filter((entry) => entry.publicationId && entry.parties.length > 0)
    .flatMap((entry) =>
      entry.parties.map((party) => ({
        publication_id: entry.publicationId as string,
        name: party.name,
        role: party.role,
        oab: party.oab,
        position: party.position,
      })),
    )

  if (rows.length === 0) return

  const { error } = await supabase.from('publication_parties').insert(rows)

  // Best-effort: a publicação já está gravada, e perdê-la por causa da lista
  // de partes seria trocar o essencial pelo acessório.
  if (error) console.error('[publicacoes/ingest] partes não gravadas:', error.message)
}

/**
 * A linha como `publications` a aceita.
 *
 * `parties` é campo da entrada, não coluna da tabela — mandá-la faria o
 * PostgREST recusar o lote inteiro por coluna desconhecida.
 */
function toColumns(
  row: PublicationIngestRow,
  fingerprint: string | null,
): Omit<PublicationIngestRow, 'parties'> & { content_fingerprint: string | null } {
  const columns = { ...row, content_fingerprint: fingerprint }
  delete columns.parties
  return columns
}

/**
 * Linha já marcada como duplicata aponta para a sobrevivente; é ela que a tela
 * mostra, então é ela que o resultado deve citar.
 */
function rootIdOf(row: ExistingRow): string {
  return row.duplicate_of_id ?? row.id
}

async function loadExisting(
  supabase: SupabaseClient,
  prepared: Prepared[],
): Promise<{
  byFingerprint: Map<string, ExistingRow[]>
  bySourceExternal: Map<string, ExistingRow>
}> {
  const byFingerprint = new Map<string, ExistingRow[]>()
  const bySourceExternal = new Map<string, ExistingRow>()

  const fingerprints = [...new Set(prepared.map((p) => p.fingerprint).filter(Boolean))] as string[]

  for (const part of chunk(fingerprints, LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from('publications')
      .select(EXISTING_COLUMNS)
      .in('content_fingerprint', part)

    if (error) throw new Error(`Consulta de publicações existentes falhou: ${error.message}`)

    for (const row of (data ?? []) as unknown as ExistingRow[]) {
      if (!row.content_fingerprint) continue
      const list = byFingerprint.get(row.content_fingerprint)
      if (list) list.push(row)
      else byFingerprint.set(row.content_fingerprint, [row])
    }
  }

  // `external_id` só é único junto com `source` — a consulta segue o índice.
  const bySource = new Map<string, string[]>()
  for (const { row } of prepared) {
    if (!row.external_id) continue
    const list = bySource.get(row.source)
    if (list) list.push(row.external_id)
    else bySource.set(row.source, [row.external_id])
  }

  for (const [source, ids] of bySource) {
    for (const part of chunk([...new Set(ids)], LOOKUP_CHUNK)) {
      const { data, error } = await supabase
        .from('publications')
        .select(EXISTING_COLUMNS)
        .eq('source', source)
        .in('external_id', part)

      if (error) throw new Error(`Consulta de publicações existentes falhou: ${error.message}`)

      for (const row of (data ?? []) as unknown as ExistingRow[]) {
        if (!row.external_id) continue
        bySourceExternal.set(`${row.source} ${row.external_id}`, row)
      }
    }
  }

  return { byFingerprint, bySourceExternal }
}

async function insertRows(
  supabase: SupabaseClient,
  rows: (Omit<PublicationIngestRow, 'parties'> & { content_fingerprint: string | null })[],
): Promise<InsertedRow[]> {
  // `ignoreDuplicates`: a linha que já existe não é reescrita — reescrever
  // apagaria `read_at`, `handled_at` e o tipo/assunto digitados por alguém.
  const { data, error } = await supabase
    .from('publications')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select('id, source, external_id, content_fingerprint')

  if (error) throw new Error(`Gravação das publicações falhou: ${error.message}`)

  return (data ?? []) as unknown as InsertedRow[]
}

/**
 * Avisos do sino. Best-effort, como `recordActivity`: perder um aviso não pode
 * desfazer a publicação que acabou de ser gravada.
 */
async function notifyInserted(
  supabase: SupabaseClient,
  outcomes: PublicationIngestOutcome[],
  source: string,
): Promise<void> {
  const news = outcomes.filter((outcome) => outcome.action === 'inserted' && outcome.publicationId)
  if (news.length === 0) return

  const { error } = await supabase.from('notifications').insert(
    news.map((outcome) => ({
      kind: 'publicacao_nova',
      resource: 'publicacoes',
      title: 'Nova publicação',
      body: [outcome.cnjNumber ?? 'Processo não informado', outcome.title]
        .filter(Boolean)
        .join(' — '),
      link: `/publicacoes/${outcome.publicationId}`,
      entity_type: 'publication',
      entity_id: outcome.publicationId,
      source,
    })),
  )

  if (error) console.error('[publicacoes/ingest] aviso não gravado:', error.message)
}
