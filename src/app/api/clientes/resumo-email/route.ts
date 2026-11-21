import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { isEmailConfigured } from '@/lib/email/config'
import {
  assessDigestEligibility,
  DIGEST_CLIENT_COLUMNS,
  type DigestClientRow,
} from '@/lib/email/digestEligibility'
import { recordDigestActivity } from '@/lib/email/digestSubscription'
import { LEGAL_AREAS } from '@/schemas/cliente.schema'
import { chunk } from '@/utils/chunk'
import type { DigestBulkSummary } from '@/types/emailMessage.types'

/**
 * POST /api/clientes/resumo-email — liga o resumo diário para o recorte atual
 * da lista de Clientes (busca + área), com prévia.
 *
 * `{ search, legalArea, dryRun: true }` só conta: quantos estão no recorte,
 * quantos já recebem, quantos pediram para sair e por que os demais não podem.
 * Com `dryRun: false`, liga os que podem.
 *
 * O recorte é o da tela, pela mesma `search_clients` (migration 91) e com o
 * client de SESSÃO: a RLS decide quem entra, exatamente como na lista. A lista
 * não tem seleção de linhas desde a paginação no servidor (docs/paginacao.md);
 * o filtro é a seleção.
 *
 * Quem pediu para sair (`email_updates_opted_out_at`) nunca é religado aqui —
 * só à mão, na ficha, com a data do pedido à vista.
 */

/** O PostgREST devolve no máximo 1000 linhas por leitura (`max_rows`). */
const READ_CEILING = 1000

const bodySchema = z.object({
  search: z.string().max(200).default(''),
  legalArea: z.enum(LEGAL_AREAS).nullable().default(null),
  dryRun: z.boolean(),
})

export async function POST(request: NextRequest) {
  const guard = await requirePermissionApi('clientes', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: 'Indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' },
      { status: 503 }
    )
  }
  // Sem envio configurado, ligar para dezenas de clientes acumularia atos para
  // um primeiro resumo enorme — e a ficha recusaria um a um pelo mesmo motivo.
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'O envio de e-mail não está configurado (Configurações → E-mail).' },
      { status: 503 }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtro inválido.' }, { status: 400 })
  }
  const { search, legalArea, dryRun } = parsed.data

  try {
    // 1. O recorte, com a RLS de quem pede.
    const session = await createClient()
    let query = session
      .rpc('search_clients', { p_search: search.trim() }, { count: 'exact' })
      .select('id')
      .eq('is_client', true)
      .order('created_at', { ascending: false })
      .limit(READ_CEILING)
    if (legalArea) query = query.contains('legal_areas', [legalArea])

    const { data: matched, error: searchError, count } = await query
    if (searchError) throw new Error(`Busca de clientes falhou: ${searchError.message}`)
    const ids = ((matched ?? []) as { id: string }[]).map((row) => row.id)

    // 2. Os cadastros, com o que a regra lê.
    const admin = createAdminClient()
    const clients: DigestClientRow[] = []
    for (const slice of chunk(ids)) {
      const { data, error } = await admin.from('clients').select(DIGEST_CLIENT_COLUMNS).in('id', slice)
      if (error) throw new Error(`Clientes não lidos: ${error.message}`)
      clients.push(...((data ?? []) as unknown as DigestClientRow[]))
    }

    // 3. Quem já recebe, quem saiu, quem pode e por que os outros não podem.
    const summary: DigestBulkSummary = {
      total: count ?? ids.length,
      truncated: (count ?? 0) > ids.length,
      alreadyEnabled: 0,
      optedOut: 0,
      eligible: 0,
      blocked: {},
    }

    const candidates: DigestClientRow[] = []
    for (const client of clients) {
      if (client.email_updates_enabled_at) summary.alreadyEnabled += 1
      else if (client.email_updates_opted_out_at) summary.optedOut += 1
      else candidates.push(client)
    }

    const eligibility = await assessDigestEligibility(admin, candidates, { emailConfigured: true })
    const toEnable = candidates.filter((client) => {
      const blocker = eligibility.get(client.id)?.blockers[0]
      if (blocker) summary.blocked[blocker] = (summary.blocked[blocker] ?? 0) + 1
      return !blocker
    })
    summary.eligible = toEnable.length

    if (dryRun || toEnable.length === 0) {
      return NextResponse.json({ summary: { ...summary, ...(dryRun ? {} : { enabled: 0 }) } })
    }

    // 4. Liga. A condição repete a regra no banco: entre a prévia e o clique,
    //    alguém pode ter ligado à mão ou o cliente pode ter saído.
    const now = new Date().toISOString()
    const enabledIds = new Set<string>()
    for (const slice of chunk(toEnable.map((client) => client.id))) {
      const { data, error } = await admin
        .from('clients')
        .update({ email_updates_enabled_at: now })
        .in('id', slice)
        .is('email_updates_enabled_at', null)
        .is('email_updates_opted_out_at', null)
        .select('id')
      if (error) throw new Error(`Clientes não atualizados: ${error.message}`)
      for (const row of (data ?? []) as { id: string }[]) enabledIds.add(row.id)
    }

    await recordDigestActivity(
      admin,
      toEnable.filter((client) => enabledIds.has(client.id)),
      guard.userId,
      true
    )

    return NextResponse.json({ summary: { ...summary, enabled: enabledIds.size } })
  } catch (error) {
    console.error('[resumo-email/lote] falhou:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível ativar o resumo para a lista.' }, { status: 500 })
  }
}
