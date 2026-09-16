/**
 * O que a página `/acompanhar/<token>` mostra.
 *
 * Monta o payload campo a campo, nunca com `select('*')`. Não é preciosismo:
 * `legal_processes` e `legal_process_movements` ganham colunas a cada
 * migration, e um `*` aqui publicaria a próxima delas sem ninguém decidir
 * nada. A lista explícita obriga a decisão a ser tomada.
 *
 * ── Dois níveis, de propósito ──
 * `getPortalProcesses` monta a LISTA e não traz o texto de movimentação
 * nenhuma; `getPortalProcessTimeline` traz a timeline de UM processo, quando o
 * cliente o abre. Antes era tudo de uma vez, e um cliente com vinte processos
 * baixava centenas de movimentações inteiras — numa conexão de celular, que é
 * de onde o link é aberto — para ler talvez uma.
 *
 * Roda sempre pela service_role — a chamada vem de uma rota anônima, já
 * autorizada pelo token em `access.ts`.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { PortalMovement, PortalProcess, PortalProcessTimeline } from '@/types/clientPortal.types'

/** Teto de movimentações por processo na página. Processo antigo passa de mil,
 * e o cliente não rola mil: as recentes são o que ele veio ver. */
const MAX_MOVEMENTS_PER_PROCESS = 50

/** Colunas do processo que o cliente vê. */
const PROCESS_FIELDS =
  'id, cnj_number, court, court_division, comarca, procedural_class, ' +
  'subject, filing_date, process_type, status, updated_at'

interface ProcessRow {
  id: string
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  filing_date: string | null
  process_type: string
  status: string
  updated_at: string
  crm_items: { title: string | null }[] | null
}

/**
 * Os processos do cliente, em resumo.
 *
 * O vínculo é `crm_items.client_id` → `crm_items.legal_process_id`, o mesmo de
 * `getLegalProcessesByClient()`, inclusive o recorte por `wf-processos`: um
 * processo pode estar ligado a itens de vários workflows, e o item mestre é
 * sempre o daquele workflow fixo. Sem esse recorte, um processo que passou por
 * uma negociação apareceria duplicado.
 */
export async function getPortalProcesses(clientId: string): Promise<PortalProcess[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('legal_processes')
    .select(
      `${PROCESS_FIELDS},
       crm_items:crm_items!crm_items_legal_process_id_fkey!inner(title)`
    )
    .eq('crm_items.client_id', clientId)
    .eq('crm_items.workflow_id', 'wf-processos')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[portal] consulta de processos falhou:', error.message)
    throw new Error('Não foi possível carregar os processos.')
  }

  const rows = (data ?? []) as unknown as ProcessRow[]
  if (rows.length === 0) return []

  const resumo = await getMovementSummaries(rows.map((row) => row.id))

  return rows.map((row) => {
    const summary = resumo.get(row.id)

    return {
      id: row.id,
      cnj_number: row.cnj_number,
      court: row.court,
      court_division: row.court_division,
      comarca: row.comarca,
      procedural_class: row.procedural_class,
      subject: row.subject,
      filing_date: row.filing_date,
      process_type: row.process_type,
      status: row.status,
      title: row.crm_items?.[0]?.title ?? null,
      movement_count: summary?.count ?? 0,
      last_movement: summary?.last ?? null,
    }
  })
}

interface MovementSummary {
  count: number
  last: { movement_date: string; title: string | null } | null
}

/**
 * Quantas movimentações cada processo tem e qual é a última.
 *
 * Traz `title`, nunca `description`. É a diferença entre um payload de alguns
 * KB e um de vários MB: o corpo do ato é o campo pesado, e a lista só precisa
 * do rótulo para dizer "andou nesta data".
 */
async function getMovementSummaries(
  processIds: string[]
): Promise<Map<string, MovementSummary>> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('legal_process_movements')
    .select('legal_process_id, movement_date, title')
    .in('legal_process_id', processIds)
    .eq('hidden_from_client', false)
    .order('movement_date', { ascending: false })

  if (error) {
    console.error('[portal] resumo de movimentações falhou:', error.message)
    throw new Error('Não foi possível carregar o andamento.')
  }

  const summaries = new Map<string, MovementSummary>()

  for (const row of (data ?? []) as {
    legal_process_id: string
    movement_date: string
    title: string | null
  }[]) {
    const current = summaries.get(row.legal_process_id)

    if (!current) {
      // A consulta vem ordenada por data desc, então o primeiro de cada
      // processo é o mais recente.
      summaries.set(row.legal_process_id, {
        count: 1,
        last: { movement_date: row.movement_date, title: row.title },
      })
      continue
    }

    current.count += 1
  }

  return summaries
}

/**
 * A timeline de um processo.
 *
 * ⚠️ `clientId` NÃO é decoração. O id do processo chega pela URL, e sem este
 * filtro qualquer titular de link válido leria a timeline de qualquer processo
 * do escritório trocando o id na barra de endereços. O vínculo é reconferido
 * aqui, contra o cliente do token, a cada chamada.
 */
export async function getPortalProcessTimeline(
  clientId: string,
  processId: string
): Promise<PortalProcessTimeline | null> {
  const admin = createAdminClient()

  const { data: owned, error: ownershipError } = await admin
    .from('legal_processes')
    .select('id, crm_items:crm_items!crm_items_legal_process_id_fkey!inner(id)')
    .eq('id', processId)
    .eq('crm_items.client_id', clientId)
    .eq('crm_items.workflow_id', 'wf-processos')
    .maybeSingle()

  if (ownershipError) {
    console.error('[portal] verificação de vínculo falhou:', ownershipError.message)
    throw new Error('Não foi possível carregar o andamento.')
  }
  if (!owned) return null

  const { data, error } = await admin
    .from('legal_process_movements')
    .select('id, movement_date, title, description')
    .eq('legal_process_id', processId)
    .eq('hidden_from_client', false)
    .order('movement_date', { ascending: false })
    // +1 para saber que há mais sem precisar de uma segunda consulta de
    // contagem; o excedente é descartado abaixo.
    .limit(MAX_MOVEMENTS_PER_PROCESS + 1)

  if (error) {
    console.error('[portal] consulta de movimentações falhou:', error.message)
    throw new Error('Não foi possível carregar o andamento.')
  }

  const rows = (data ?? []) as PortalMovement[]
  const truncated = rows.length > MAX_MOVEMENTS_PER_PROCESS

  return {
    process_id: processId,
    movements: rows.slice(0, MAX_MOVEMENTS_PER_PROCESS),
    truncated,
  }
}
