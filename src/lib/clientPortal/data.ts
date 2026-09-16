/**
 * O que a página `/acompanhar/<token>` mostra.
 *
 * Monta o payload campo a campo, nunca com `select('*')`. Não é preciosismo:
 * `legal_processes` e `legal_process_movements` ganham colunas a cada
 * migration, e um `*` aqui publicaria a próxima delas sem ninguém decidir
 * nada. A lista explícita obriga a decisão a ser tomada.
 *
 * Roda sempre pela service_role — a chamada vem de uma rota anônima, já
 * autorizada pelo token em `access.ts`.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { PortalMovement, PortalProcess } from '@/types/clientPortal.types'

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

interface MovementRow {
  id: string
  legal_process_id: string
  movement_date: string
  title: string | null
  description: string
}

/**
 * Os processos do cliente.
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

  const movementsByProcess = await getVisibleMovements(rows.map((row) => row.id))

  return rows.map((row) => ({
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
    movements: movementsByProcess.get(row.id) ?? [],
  }))
}

/**
 * As movimentações visíveis dos processos informados.
 *
 * Consulta separada, e não um embed com filtro, de propósito: `hidden_from_client`
 * é a linha que separa o que o escritório publicou do que ele escondeu, e um
 * filtro sobre recurso embutido no PostgREST tem semântica sutil demais para
 * carregar essa responsabilidade. Aqui o `eq` é sobre a própria tabela — não
 * há como ler errado.
 */
async function getVisibleMovements(
  processIds: string[]
): Promise<Map<string, PortalMovement[]>> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('legal_process_movements')
    .select('id, legal_process_id, movement_date, title, description')
    .in('legal_process_id', processIds)
    .eq('hidden_from_client', false)
    .order('movement_date', { ascending: false })

  if (error) {
    console.error('[portal] consulta de movimentações falhou:', error.message)
    throw new Error('Não foi possível carregar o andamento.')
  }

  const grouped = new Map<string, PortalMovement[]>()

  for (const row of (data ?? []) as MovementRow[]) {
    const list = grouped.get(row.legal_process_id) ?? []
    if (list.length >= MAX_MOVEMENTS_PER_PROCESS) continue

    list.push({
      id: row.id,
      movement_date: row.movement_date,
      title: row.title,
      description: row.description,
    })
    grouped.set(row.legal_process_id, list)
  }

  return grouped
}
