import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { collectBatches } from './collect'
import { enqueueBatch, type BatchWork } from './enqueue'

/** A chegada também recolhe o que ficou pronto, sem consultar a cada entrega. */
const ARRIVAL_COLLECT_INTERVAL_MS = 5 * 60_000

/**
 * Depois de uma entrega do webhook (fase 5): recolhe os lotes prontos e manda
 * o que as linhas novas pedem — a triagem de cada publicação, o resumo dos
 * processos que receberam algo e as respostas do portal dos que receberam
 * movimentação (o portal só mostra movimentações). Cada trabalho confere se
 * há o que fazer antes de entrar no lote.
 */
export async function enqueueArrivalWork(rows: {
  movementIds: string[]
  publicationIds: string[]
}): Promise<void> {
  if (!hasServiceRoleKey()) return
  await collectBatches({ minIntervalMs: ARRIVAL_COLLECT_INTERVAL_MS })
  if (rows.movementIds.length === 0 && rows.publicationIds.length === 0) return

  const admin = createAdminClient()
  const [movements, publications] = await Promise.all([
    rows.movementIds.length
      ? admin.from('legal_process_movements').select('legal_process_id').in('id', rows.movementIds)
      : Promise.resolve({ data: [] as { legal_process_id: string | null }[], error: null }),
    rows.publicationIds.length
      ? admin.from('publications').select('legal_process_id').in('id', rows.publicationIds)
      : Promise.resolve({ data: [] as { legal_process_id: string | null }[], error: null }),
  ])
  if (movements.error || publications.error) {
    console.error('[ia-lote] processos da entrega:', movements.error ?? publications.error)
    return
  }

  const byMovement = new Set(
    (movements.data ?? []).map((row) => row.legal_process_id).filter((id): id is string => !!id),
  )
  const byPublication = (publications.data ?? [])
    .map((row) => row.legal_process_id)
    .filter((id): id is string => !!id)

  const work: BatchWork[] = [
    ...rows.publicationIds.map((entityId) => ({ kind: 'triage' as const, entityId })),
    ...[...new Set([...byMovement, ...byPublication])].map((entityId) => ({
      kind: 'process_summary' as const,
      entityId,
    })),
    ...[...byMovement].map((entityId) => ({ kind: 'portal_answers' as const, entityId })),
  ]
  await enqueueBatch(work)
}

/** Depois do sync de um processo que trouxe movimentações: o resumo e as
 * respostas do portal dele, em lote. */
export async function enqueueProcessWork(legalProcessId: string): Promise<void> {
  if (!hasServiceRoleKey()) return
  await collectBatches({ minIntervalMs: ARRIVAL_COLLECT_INTERVAL_MS })
  await enqueueBatch([
    { kind: 'process_summary', entityId: legalProcessId },
    { kind: 'portal_answers', entityId: legalProcessId },
  ])
}

/**
 * As publicações recentes ainda sem triagem: as que entraram pelo sync de
 * intimações, pela busca por OAB ou numa entrega que falhou. O cron diário e
 * o sync de intimações passam por aqui; o teto segura uma base antiga inteira.
 */
export async function enqueueUntriagedPublications(options: {
  sinceDays: number
  limit: number
}): Promise<void> {
  if (!hasServiceRoleKey()) return
  const admin = createAdminClient()
  const since = new Date(Date.now() - options.sinceDays * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('publications')
    .select('id, triage:publication_triage(publication_id)')
    .is('duplicate_of_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(options.limit)
  if (error) {
    console.error('[ia-lote] publicações sem triagem:', error.code, error.message)
    return
  }
  const untriaged = ((data ?? []) as { id: string; triage: unknown }[]).filter(
    (row) => !row.triage || (Array.isArray(row.triage) && row.triage.length === 0),
  )
  await enqueueBatch(untriaged.map((row) => ({ kind: 'triage', entityId: row.id })))
}
