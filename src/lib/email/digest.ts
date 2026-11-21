// Server-side. O resumo diário dos processos (docs/emails-clientes.md, "O
// resumo diário, em detalhe"). Roda pelo cron, com a service_role — não há
// sessão, e a autorização é o CRON_SECRET da rota.
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPortalUrl } from '@/lib/clientPortal/token'
import { MOVEMENT_CATEGORIES } from '@/features/movimentacoes/utils/categories'
import { isPortalAnswersEnabled } from '@/features/portal/answers/ensurePortalAnswers'
import { getClientGreetingName } from '@/types/cliente.types'
import type { MovementCategory } from '@/types/legalProcess.types'
import type { DigestBlocker, EmailStatus } from '@/types/emailMessage.types'
import { chunk } from '@/utils/chunk'
import {
  ProcessDigestEmail,
  processDigestSubject,
  type DigestAct,
  type DigestProcess,
} from '@/emails/ProcessDigestEmail'
import { getEmailConfig } from './config'
import { brazilDay, formatInstantDay, formatInstantTime, formatStoredDay } from './dates'
import { assessDigestEligibility, DIGEST_CLIENT_COLUMNS, type DigestClientRow } from './digestEligibility'
import { loadOfficeIdentity } from './office'
import { renderEmail } from './render'
import { sendEmail } from './send'
import { unsubscribeApiUrl, unsubscribePageUrl, unsubscribeToken } from './unsubscribe'

// ── As regras, num lugar só ─────────────────────────────────────────────────

/** O que muda a situação do cliente. Juntada, expediente, petição e intimação
 * crua são o grosso das ~140 movimentações por mês e só gerariam ruído. */
export const DIGEST_CATEGORIES = [
  'decisao',
  'audiencia',
  'recurso',
  'encerramento',
] as const satisfies readonly MovementCategory[]

/** O `sync` importa o histórico inteiro ao cadastrar o processo (migration 68):
 * isso não é novidade. */
const DIGEST_RECEIVED_VIA = ['webhook', 'manual']

/** Carência para a equipe ocultar um ato antes de ele virar e-mail. */
export const DIGEST_GRACE_HOURS = 2

/**
 * Ato mais velho que isto não entra, mesmo nunca enviado. Protege de duas
 * enxurradas: o cron que ficou dias parado, e o cliente ligado antes de o
 * envio estar configurado — no primeiro resumo, chegariam de uma vez todos os
 * atos desde a ativação.
 */
export const DIGEST_MAX_AGE_DAYS = 7

/** Ato ligado a um resumo com estes status já foi — não entra no próximo. Os
 * que ficam de fora (`failed`, `suppressed`) não saíram. */
const CONSUMED_STATUSES: EmailStatus[] = [
  'queued',
  'sent',
  'delivered',
  'delayed',
  'bounced',
  'complained',
]

const HOUR_MS = 60 * 60 * 1000

// ── Resultado ───────────────────────────────────────────────────────────────

export interface DigestRunResult {
  /** Clientes com o resumo ligado. */
  considered: number
  sent: number
  /** Ligados, sem ato novo hoje. */
  nothingNew: number
  failed: number
  /** Com novidade, mas sem poder receber — pelo primeiro motivo. */
  skipped: Partial<Record<DigestBlocker | 'duplicate', number>>
  /** As primeiras falhas, para o log do cron. */
  errors: string[]
}

const MAX_REPORTED_ERRORS = 10

// ── Datas ───────────────────────────────────────────────────────────────────

/** A data da audiência é um instante de verdade (`events.start_at`). */
function hearingMoment(startAt: string, allDay: boolean): string {
  const day = formatInstantDay(startAt)
  return allDay ? day : `${day} às ${formatInstantTime(startAt)}`
}

// ── Leitura ─────────────────────────────────────────────────────────────────

interface ProcessLink {
  client_id: string
  legal_process_id: string
  title: string | null
  legal_process: { cnj_number: string | null; subject: string | null } | null
}

interface MovementRow {
  id: string
  legal_process_id: string
  movement_date: string
  category: MovementCategory
  created_at: string
}

interface HearingRow {
  movement_id: string
  kind_id: string
  kind: { label: string } | null
  event: { start_at: string; all_day: boolean } | null
}

/** O processo de um cliente, com os atos novos para ELE. */
interface PendingProcess extends DigestProcess {
  /** Para ordenar os processos: o de ato mais recente primeiro. */
  latest: string
}

/**
 * Os atos novos de cada cliente. Uma leitura por tabela e por fatia, para
 * todos os clientes de uma vez — o cron roda para a carteira inteira.
 *
 * Exportada para poder ser exercitada à parte do envio (a regra de seleção é
 * o que decide o que o cliente lê).
 */
export async function loadPendingProcesses(
  admin: SupabaseClient,
  clients: DigestClientRow[],
  now: Date,
): Promise<Map<string, PendingProcess[]>> {
  const result = new Map<string, PendingProcess[]>()
  if (clients.length === 0) return result

  // 1. Os processos de cada cliente — o vínculo do portal (`getPortalProcesses`):
  //    `crm_items.client_id` no workflow fixo `wf-processos`.
  const links: ProcessLink[] = []
  for (const slice of chunk(clients.map((client) => client.id))) {
    const { data, error } = await admin
      .from('crm_items')
      .select(
        'client_id, legal_process_id, title, legal_process:legal_processes!crm_items_legal_process_id_fkey(cnj_number, subject)'
      )
      .in('client_id', slice)
      .eq('workflow_id', 'wf-processos')
      .not('legal_process_id', 'is', null)
    if (error) throw new Error(`Processos dos clientes não lidos: ${error.message}`)
    links.push(...((data ?? []) as unknown as ProcessLink[]))
  }

  const processIds = [...new Set(links.map((link) => link.legal_process_id))]
  if (processIds.length === 0) return result

  // 2. Os atos que podem entrar: visíveis, do canal certo, da categoria certa,
  //    fora da carência e dentro da janela.
  const enabledTimes = clients.map((client) => Date.parse(client.email_updates_enabled_at ?? ''))
  const floor = Math.max(Math.min(...enabledTimes), now.getTime() - DIGEST_MAX_AGE_DAYS * 24 * HOUR_MS)
  const cutoff = now.getTime() - DIGEST_GRACE_HOURS * HOUR_MS

  const movements: MovementRow[] = []
  for (const slice of chunk(processIds)) {
    const { data, error } = await admin
      .from('legal_process_movements')
      .select('id, legal_process_id, movement_date, category, created_at')
      .in('legal_process_id', slice)
      .eq('hidden_from_client', false)
      .in('received_via', DIGEST_RECEIVED_VIA)
      .in('category', [...DIGEST_CATEGORIES])
      .gte('created_at', new Date(floor).toISOString())
      .lt('created_at', new Date(cutoff).toISOString())
      .order('movement_date', { ascending: true })
    if (error) throw new Error(`Movimentações não lidas: ${error.message}`)
    movements.push(...((data ?? []) as MovementRow[]))
  }
  if (movements.length === 0) return result

  // 3. O que já foi, por cliente: o mesmo ato pode ser de dois clientes.
  const consumed = new Set<string>()
  for (const slice of chunk(movements.map((movement) => movement.id))) {
    const { data, error } = await admin
      .from('email_message_movements')
      .select('movement_id, message:email_messages!inner(client_id, status)')
      .in('movement_id', slice)
    if (error) throw new Error(`Resumos anteriores não lidos: ${error.message}`)
    for (const row of (data ?? []) as unknown as {
      movement_id: string
      message: { client_id: string | null; status: EmailStatus } | null
    }[]) {
      if (row.message?.client_id && CONSUMED_STATUSES.includes(row.message.status)) {
        consumed.add(`${row.message.client_id}:${row.movement_id}`)
      }
    }
  }

  // 4. Audiência: a data vem da ficha + evento — a fonte única da data
  //    (docs/audiencias.md). Remarcada ou corrigida à mão, sai certa.
  const hearings = new Map<string, HearingRow>()
  const hearingMovementIds = movements.filter((m) => m.category === 'audiencia').map((m) => m.id)
  for (const slice of chunk(hearingMovementIds)) {
    const { data, error } = await admin
      .from('hearings')
      .select(
        'movement_id, kind_id, kind:hearing_kinds!hearings_kind_id_fkey(label), event:events!hearings_event_id_fkey(start_at, all_day)'
      )
      .in('movement_id', slice)
      .eq('status', 'designada')
    // Sem a ficha, o ato sai só como "Audiência" — perder a data não é motivo
    // para não mandar o resumo.
    if (error) {
      console.error('[email/resumo] audiências não lidas:', error.message)
      break
    }
    for (const row of (data ?? []) as unknown as HearingRow[]) hearings.set(row.movement_id, row)
  }

  // 5. Montagem, cliente a cliente.
  const movementsByProcess = new Map<string, MovementRow[]>()
  for (const movement of movements) {
    const list = movementsByProcess.get(movement.legal_process_id) ?? []
    list.push(movement)
    movementsByProcess.set(movement.legal_process_id, list)
  }

  const enabledAt = new Map(clients.map((client) => [client.id, client.email_updates_enabled_at ?? '']))

  for (const link of links) {
    const since = Date.parse(enabledAt.get(link.client_id) ?? '')
    const acts: DigestAct[] = (movementsByProcess.get(link.legal_process_id) ?? [])
      .filter((movement) => Date.parse(movement.created_at) >= since)
      .filter((movement) => !consumed.has(`${link.client_id}:${movement.id}`))
      .map((movement) => ({
        id: movement.id,
        day: formatStoredDay(movement.movement_date),
        label: actLabel(movement, hearings.get(movement.id)),
      }))
    if (acts.length === 0) continue

    const list = result.get(link.client_id) ?? []
    // Dois cards do mesmo processo no mesmo cliente: um bloco só.
    if (list.some((process) => process.id === link.legal_process_id)) continue
    const latest = (movementsByProcess.get(link.legal_process_id) ?? []).at(-1)?.movement_date ?? ''
    list.push({
      id: link.legal_process_id,
      title: link.title?.trim() || link.legal_process?.subject?.trim() || null,
      cnj: link.legal_process?.cnj_number ?? null,
      acts,
      latest,
    })
    result.set(link.client_id, list)
  }

  for (const list of result.values()) list.sort((a, b) => b.latest.localeCompare(a.latest))
  return result
}

/** O ato em palavras. Audiência com ficha designada e data diz quando; o resto
 * diz só o tipo (decisão 2: o texto do tribunal fica no portal). */
function actLabel(movement: MovementRow, hearing: HearingRow | undefined): string {
  if (movement.category === 'audiencia' && hearing?.event) {
    const kind = hearing.kind_id !== 'outra' && hearing.kind?.label ? ` (${hearing.kind.label})` : ''
    return `Audiência${kind} marcada para ${hearingMoment(hearing.event.start_at, hearing.event.all_day)}`
  }
  return MOVEMENT_CATEGORIES[movement.category].label
}

// ── A execução ──────────────────────────────────────────────────────────────

/**
 * Manda o resumo do dia a cada cliente ligado que tenha ato novo.
 *
 * Um envio por vez: são poucas dezenas por dia, bem abaixo do limite de 10
 * requisições por segundo do Resend, e cada envio tem sua própria linha,
 * chave de idempotência e `dedupe_key` — o lote do Resend dividiria isso.
 * Falha de um cliente não para os outros.
 */
export async function runProcessDigest(
  admin: SupabaseClient,
  { origin, now = new Date() }: { origin: string; now?: Date },
): Promise<DigestRunResult> {
  const result: DigestRunResult = {
    considered: 0,
    sent: 0,
    nothingNew: 0,
    failed: 0,
    skipped: {},
    errors: [],
  }
  const skip = (reason: DigestBlocker | 'duplicate') => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1
  }

  const { data, error } = await admin
    .from('clients')
    .select(DIGEST_CLIENT_COLUMNS)
    .eq('is_client', true)
    .not('email_updates_enabled_at', 'is', null)
  if (error) throw new Error(`Clientes do resumo não lidos: ${error.message}`)

  const clients = (data ?? []) as unknown as DigestClientRow[]
  result.considered = clients.length
  if (clients.length === 0) return result

  const pending = await loadPendingProcesses(admin, clients, now)
  const withNews = clients.filter((client) => (pending.get(client.id)?.length ?? 0) > 0)
  result.nothingNew = clients.length - withNews.length
  if (withNews.length === 0) return result

  const config = getEmailConfig()
  if (!config) {
    result.skipped.email_not_configured = withNews.length
    return result
  }

  const eligibility = await assessDigestEligibility(admin, withNews, { emailConfigured: true })
  const office = await loadOfficeIdentity(admin)
  const showAnswersHint = await isPortalAnswersEnabled()
  const day = brazilDay(now)
  const httpsOrigin = /^https:\/\//i.test(origin)

  for (const client of withNews) {
    const processes = pending.get(client.id) ?? []
    const status = eligibility.get(client.id)
    const blocker = status?.blockers[0]
    if (!status || blocker || !status.recipient || !status.portalToken) {
      skip(blocker ?? 'no_portal_link')
      continue
    }

    try {
      const token = await unsubscribeToken(client.id)
      const portalUrl = buildPortalUrl(origin, status.portalToken)
      const content = await renderEmail(
        createElement(ProcessDigestEmail, {
          office,
          greetingName: getClientGreetingName(client),
          processes,
          portalUrl,
          unsubscribeUrl: unsubscribePageUrl(origin, client.id, token),
          showAnswersHint,
        })
      )

      const sent = await sendEmail(
        admin,
        {
          kind: 'process_digest',
          resource: 'clientes',
          clientId: client.id,
          to: status.recipient,
          subject: processDigestSubject(processes.length, office),
          content,
          office,
          sentBy: null,
          dedupeKey: `process_digest:${client.id}:${day}`,
          redactions: [{ secret: status.portalToken, replacement: `••••${status.tokenHint ?? ''}` }],
          // Descadastro em um clique (RFC 8058): Gmail e Outlook mostram o
          // botão e fazem o POST. A RFC exige HTTPS — em dev não vai.
          ...(httpsOrigin
            ? {
                headers: {
                  'List-Unsubscribe': `<${unsubscribeApiUrl(origin, client.id, token)}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
              }
            : {}),
        },
        config
      )

      // A linha existe (enviada ou falha): liga os atos a ela. É o que faz o
      // ato enviado não voltar amanhã — e o que falhou voltar.
      if (sent.message) {
        const rows = processes.flatMap((process) =>
          process.acts.map((act) => ({ email_message_id: sent.message!.id, movement_id: act.id }))
        )
        const { error: linkError } = await admin.from('email_message_movements').insert(rows)
        if (linkError) {
          // Sem o vínculo, os mesmos atos iriam de novo amanhã. Grita no log.
          console.error('[email/resumo] atos não ligados ao resumo:', sent.message.id, linkError.message)
          result.errors.push(`Atos não ligados ao resumo ${sent.message.id}: ${linkError.message}`)
        }
      }

      if (sent.ok) result.sent += 1
      else if (sent.status === 409 && !sent.message) skip('duplicate')
      else {
        result.failed += 1
        if (result.errors.length < MAX_REPORTED_ERRORS) result.errors.push(`${client.id}: ${sent.error}`)
      }
    } catch (caught) {
      result.failed += 1
      const detail = caught instanceof Error ? caught.message : String(caught)
      console.error('[email/resumo] cliente não processado:', client.id, detail)
      if (result.errors.length < MAX_REPORTED_ERRORS) result.errors.push(`${client.id}: ${detail}`)
    }
  }

  return result
}
