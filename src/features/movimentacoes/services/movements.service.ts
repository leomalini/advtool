import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type {
  LegalProcessMovementWithContext,
  MovementCategory,
} from '@/types/legalProcess.types'
import {
  MOVEMENT_GROUPS,
  MOVEMENT_GROUP_ORDER,
  groupOf,
  type MovementGroup,
} from '../utils/categories'
import type { MovementFilters } from '../utils/movementFilters'

const supabase = createClient()

/** Quantas linhas por página. Diferente de Publicações, que traz a tabela
 * inteira: um escritório com 200 processos passa de 20 mil movimentações. */
export const PAGE_SIZE = 50

/**
 * `!inner` no processo é o que permite filtrar por tribunal, que é coluna de
 * `legal_processes` e não desta tabela. Seguro porque
 * `legal_process_movements.legal_process_id` é NOT NULL (migration 9) — o
 * inner join não descarta linha nenhuma.
 *
 * O embed é o mesmo de `getRecentMovements`, para reusar
 * `LegalProcessMovementWithContext` em vez de criar um tipo quase igual.
 */
const MOVEMENT_SELECT = `
  *,
  legal_process:legal_processes!inner(
    id, cnj_number, court,
    crm_items:crm_items!crm_items_legal_process_id_fkey(id, workflow_id, title, client:clients(type, name, company_name, trade_name))
  )
`

/**
 * `movement_date` é timestamptz, mas a ingestão grava 'yyyy-MM-dd' — ou seja,
 * meia-noite UTC do dia do ato. O frontend lê o dia cortando o ISO por posição
 * (`formatMovementDate`), o que equivale a ler em UTC.
 *
 * Então o recorte compara timestamptz contra meia-noite UTC: é o que mantém o
 * índice `idx_movements_feed` utilizável E concorda com
 * `public.movements_daily_activity`, que agrupa por `at time zone 'UTC'`. Usar
 * o fuso do navegador aqui faria o gráfico e a lista discordarem na borda.
 */
function utcDayStart(isoDay: string): string {
  return `${isoDay}T00:00:00.000Z`
}

function utcDayAfter(isoDay: string): string {
  return utcDayStart(format(addDays(parseISO(isoDay), 1), 'yyyy-MM-dd'))
}

/** Termo que é número de processo: só dígitos e a pontuação do CNJ. */
function looksLikeCaseNumber(term: string): boolean {
  return /^[\d.\-/\s]+$/.test(term) && /\d{4,}/.test(term)
}

export interface MovementPage {
  rows: LegalProcessMovementWithContext[]
  /** Total que casa o filtro, do `count: 'exact'` — não o tamanho de `rows`. */
  total: number
}

export async function getMovements(
  filters: MovementFilters,
  page: number,
): Promise<MovementPage> {
  let query = supabase
    .from('legal_process_movements')
    .select(MOVEMENT_SELECT, { count: 'exact' })
    // Publicação tem módulo próprio, com o seu próprio read_at/handled_at.
    // Linhas antigas com kind='publicacao' existem (anteriores à migration 44).
    .eq('kind', 'movimentacao')
    // ⚠️ As TRÊS cláusulas são necessárias. `movement_date` é o dia, e dezenas
    // de linhas empatam nele: sem desempate total o `.range()` repete e salta
    // registros entre páginas. Espelha `idx_movements_feed`.
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .gte('movement_date', utcDayStart(filters.from))
    .lt('movement_date', utcDayAfter(filters.to))

  if (filters.categories.length > 0) {
    query = query.in('category', filters.categories)
  }
  if (filters.requiresAction) {
    query = query.eq('requires_action', true)
  }
  if (filters.onlyUnhandled) {
    query = query.is('handled_at', null)
  }
  if (filters.court) {
    query = query.eq('legal_process.court', filters.court)
  }

  const term = filters.search.trim()
  if (term) {
    if (looksLikeCaseNumber(term)) {
      // O CNJ é gravado formatado ('0000000-00.0000.0.00.0000'), então o termo
      // vai como digitado: um `ilike` não atravessa a pontuação, e PostgREST
      // não expressa um regexp_replace na coluna. Mesma limitação que a busca
      // de Publicações já tem.
      query = query.ilike('legal_process.cnj_number', `%${term}%`)
    } else {
      // Vírgula e parêntese são a sintaxe do `or=()` do PostgREST — num termo
      // de busca eles quebrariam o filtro inteiro.
      const safe = term.replace(/[,()]/g, ' ')
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
    }
  }

  const from = page * PAGE_SIZE
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1)
  if (error) throw error

  return {
    rows: (data ?? []) as unknown as LegalProcessMovementWithContext[],
    total: count ?? 0,
  }
}

export async function setMovementHandled(id: string, handled: boolean): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('legal_process_movements')
    // Tratar implica ter lido: gravar os dois juntos evita o estado
    // "providência tomada mas não lida", igual a setPublicationHandled.
    .update(
      handled
        ? { handled_at: now, read_at: now }
        : { handled_at: null },
    )
    .eq('id', id)

  if (error) throw error
}

export async function setMovementVisibility(id: string, hidden: boolean): Promise<void> {
  const { error } = await supabase
    .from('legal_process_movements')
    .update({ hidden_from_client: hidden })
    .eq('id', id)

  if (error) throw error
}

/** O backlog inteiro, sem recorte de período: é o número do badge do menu. */
export async function countActionRequiredMovements(): Promise<number> {
  const { count, error } = await supabase
    .from('legal_process_movements')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'movimentacao')
    .eq('requires_action', true)
    .is('handled_at', null)

  if (error) throw error
  return count ?? 0
}

/** Tribunais para o filtro. Sem DISTINCT no PostgREST: vem a coluna e o
 * conjunto se forma aqui — são centenas de processos, não milhares. */
export async function getMovementCourts(): Promise<string[]> {
  const { data, error } = await supabase
    .from('legal_processes')
    .select('court')
    .not('court', 'is', null)

  if (error) throw error

  const courts = new Set<string>()
  for (const row of (data ?? []) as { court: string | null }[]) {
    if (row.court) courts.add(row.court)
  }
  return [...courts].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ── Pulso ────────────────────────────────────────────────────────────────────

/** Um ponto por dia, já somado por grupo visual — pronto para o recharts. */
export type DailyActivityPoint = {
  /** 'yyyy-MM-dd'. */
  day: string
  total: number
} & Record<MovementGroup, number>

interface DailyActivityRpcRow {
  day: string
  category: MovementCategory
  total: number
}

/** Explícito, sem cast: se um grupo entrar em `MovementGroup`, o tsc aponta
 * aqui em vez de a coluna somar errado em silêncio. */
function emptyPoint(day: string): DailyActivityPoint {
  return { day, total: 0, decisoes: 0, prazos: 0, partes: 0, expediente: 0 }
}

/**
 * Atos por dia, agrupados nas 4 faixas do gráfico.
 *
 * O RPC não devolve dia sem ato — quem preenche o zero é daqui, como
 * `getPublicationsPerDay` faz para publicações. Sem isso o recharts
 * interpolaria a coluna ausente e um fim de semana vazio viraria uma rampa.
 */
export async function getDailyActivity(
  from: string,
  to: string,
): Promise<DailyActivityPoint[]> {
  const { data, error } = await supabase.rpc('movements_daily_activity', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error

  const byDay = new Map<string, DailyActivityPoint>()
  for (const row of (data ?? []) as DailyActivityRpcRow[]) {
    const point = byDay.get(row.day) ?? emptyPoint(row.day)
    const group = groupOf(row.category)
    point[group] += row.total
    point.total += row.total
    byDay.set(row.day, point)
  }

  // Contagem de dias calculada uma vez: o laço termina por construção, e um
  // período invertido devolve vazio em vez de girar.
  const start = parseISO(from)
  const span = differenceInCalendarDays(parseISO(to), start)

  const days: DailyActivityPoint[] = []
  for (let i = 0; i <= span; i++) {
    const day = format(addDays(start, i), 'yyyy-MM-dd')
    days.push(byDay.get(day) ?? emptyPoint(day))
  }
  return days
}

/** Os rótulos do gráfico, na ordem do empilhamento. */
export const ACTIVITY_SERIES = MOVEMENT_GROUP_ORDER.map((group) => ({
  key: group,
  label: MOVEMENT_GROUPS[group].label,
  color: `var(${MOVEMENT_GROUPS[group].colorVar})`,
}))

// ── Processos em silêncio ────────────────────────────────────────────────────

export interface ProcessSilenceRow {
  legal_process_id: string
  cnj_number: string | null
  court: string | null
  /** Nulo = nunca movimentou. */
  last_movement_date: string | null
  /** Nulo = nunca movimentou. */
  days_since: number | null
  movement_count: number
}

export async function getProcessSilence(): Promise<ProcessSilenceRow[]> {
  const { data, error } = await supabase.rpc('processes_without_movement')
  if (error) throw error
  return (data ?? []) as ProcessSilenceRow[]
}
