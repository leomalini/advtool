import type { WebhookMovement } from '../services/dashboard.service'

const PROCESSOS_WORKFLOW = 'wf-processos'

type MovementClient = WebhookMovement['legal_process']['crm_items'][number]['client']

/** One processo with news from the monitoring webhook. */
export interface ProcessNews {
  legalProcessId: string
  /** The row prints the CNJ in monospace when there is one. */
  cnjNumber: string | null
  /** The master card's title — what identifies a processo without a number. */
  title: string | null
  /** Court acronym ('TJES') when the cover informed it. */
  court: string | null
  clientName: string | null
  /** Movements that arrived in the window. */
  count: number
  /** The newest arrival — the one the row describes. */
  latest: ProcessNewsItem
  /** The newest few, `latest` first — the preview on hover. */
  recent: ProcessNewsItem[]
}

export interface ProcessNewsItem {
  /** `title` when the origin classified the act; otherwise the description,
   * which is always the case for what the webhook delivers today. */
  text: string
  /** The act's own date ('yyyy-MM-dd'), as the court dated it. */
  actDate: string
  receivedAt: string
}

/** How many acts the hover preview lists. */
const RECENT_PER_PROCESS = 3

function newsItem(movement: WebhookMovement): ProcessNewsItem {
  return {
    text: movement.title?.trim() || movement.description,
    actDate: movement.movement_date,
    receivedAt: movement.created_at,
  }
}

function clientName(client: MovementClient): string | null {
  if (!client) return null
  return client.type === 'individual' ? client.name : (client.trade_name ?? client.company_name)
}

/**
 * Groups the arrivals by processo, newest first. Movements come in bursts —
 * 42 from a single processo in a month — and listing them one by one would let
 * one processo push every other off the card.
 *
 * Expects `movements` newest first, as `getWebhookMovements` returns them: the
 * first movement seen for a processo is its latest, and the Map keeps the
 * processos in that order.
 */
export function groupProcessNews(movements: readonly WebhookMovement[]): ProcessNews[] {
  const groups = new Map<string, ProcessNews>()

  for (const movement of movements) {
    const existing = groups.get(movement.legal_process_id)
    if (existing) {
      existing.count += 1
      if (existing.recent.length < RECENT_PER_PROCESS) existing.recent.push(newsItem(movement))
      continue
    }

    const process = movement.legal_process
    // Same pick as MovimentacoesFeed: the processos-workflow card is the one
    // that carries the client; any card will do when there is none.
    const master =
      process.crm_items.find((item) => item.workflow_id === PROCESSOS_WORKFLOW) ??
      process.crm_items[0]

    groups.set(movement.legal_process_id, {
      legalProcessId: movement.legal_process_id,
      cnjNumber: process.cnj_number,
      title: master?.title?.trim() || null,
      court: process.court,
      clientName: clientName(master?.client ?? null),
      count: 1,
      latest: newsItem(movement),
      recent: [newsItem(movement)],
    })
  }

  return [...groups.values()]
}
