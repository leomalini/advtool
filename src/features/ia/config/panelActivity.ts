// Só no servidor: lê com a service_role. As rotas conferem `configuracoes:view`.
import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { officeDayStart, officeToday } from '@/features/ia/tools/shared'
import type {
  AiMonthUsage,
  AiSettingsLogEntry,
  AiUsageByRoute,
} from '@/types/aiSettings.types'

/** Linhas por página da leitura de `ai_usage` (o teto padrão do PostgREST). */
const PAGE_SIZE = 1000
/** Um mês muito acima disso já é caso de olhar o Console, não esta tela. */
const MAX_PAGES = 50
const LOG_LIMIT = 50

const usageRowSchema = z.object({
  route: z.string(),
  cost_usd: z.coerce.number().nullable(),
})

const logRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  kind: z.enum(['provider', 'model', 'key_set', 'key_removed', 'budget', 'toggle', 'test']),
  details: z.record(z.string(), z.unknown()),
  changed_by: z.string().nullable(),
})

export class AiActivityUnavailableError extends Error {}

/**
 * O gasto do mês corrente (fuso do escritório), somado por rota a partir de
 * `ai_usage` — a mesma fonte do teto (`ai_usage_month_cost_usd`). Chamada sem
 * preço (Gemini) entra na contagem, não no total.
 */
export async function loadMonthUsage(now: Date = new Date()): Promise<AiMonthUsage> {
  if (!hasServiceRoleKey()) throw new AiActivityUnavailableError('sem service_role')
  const month = `${officeToday(now).slice(0, 7)}-01`
  const admin = createAdminClient()

  const byRoute = new Map<string, AiUsageByRoute>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin
      .from('ai_usage')
      .select('route, cost_usd')
      .gte('created_at', officeDayStart(month))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw new AiActivityUnavailableError(`${error.code}: ${error.message}`)
    const rows = z.array(usageRowSchema).parse(data ?? [])

    for (const row of rows) {
      const entry = byRoute.get(row.route) ?? {
        route: row.route,
        calls: 0,
        costUsd: 0,
        uncosted: 0,
      }
      entry.calls++
      if (row.cost_usd === null) entry.uncosted++
      else entry.costUsd += row.cost_usd
      byRoute.set(row.route, entry)
    }
    if (rows.length < PAGE_SIZE) break
  }

  const routes = [...byRoute.values()].sort((a, b) => b.costUsd - a.costUsd)
  return {
    month,
    totalUsd: routes.reduce((sum, entry) => sum + entry.costUsd, 0),
    calls: routes.reduce((sum, entry) => sum + entry.calls, 0),
    uncosted: routes.reduce((sum, entry) => sum + entry.uncosted, 0),
    byRoute: routes,
  }
}

/** As últimas alterações do painel, com o nome de quem fez. */
export async function loadSettingsLog(): Promise<AiSettingsLogEntry[]> {
  if (!hasServiceRoleKey()) throw new AiActivityUnavailableError('sem service_role')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_settings_log')
    .select('id, created_at, kind, details, changed_by')
    .order('created_at', { ascending: false })
    .limit(LOG_LIMIT)
  if (error) throw new AiActivityUnavailableError(`${error.code}: ${error.message}`)
  const rows = z.array(logRowSchema).parse(data ?? [])

  const authorIds = [...new Set(rows.flatMap((row) => (row.changed_by ? [row.changed_by] : [])))]
  const names = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds)
    if (profilesError) {
      console.error('[ia-config] autores do histórico:', profilesError.code, profilesError.message)
    }
    for (const profile of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (profile.full_name) names.set(profile.id, profile.full_name)
    }
  }

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    details: row.details,
    changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
  }))
}
