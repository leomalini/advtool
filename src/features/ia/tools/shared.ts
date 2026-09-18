import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O client que as tools de leitura recebem: o do usuário logado (cookies),
 * nunca o de service role. É a RLS de cada tabela que decide o que a IA vê —
 * as tools não repetem regra de permissão nenhuma.
 */
export type ToolClient = SupabaseClient

/** Teto de linhas por tool. O modelo pede mais quando precisa; despejar a
 * tabela inteira no contexto custa token e piora a resposta. */
export const MAX_RESULTS = 20

export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULTS)
  .optional()
  .describe(`Máximo de resultados (padrão 10, teto ${MAX_RESULTS}).`)

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato yyyy-MM-dd')

/**
 * Fuso do escritório, explícito. Na tela quem converte é o navegador
 * (`agenda/utils/datetime.ts`); aqui o código roda no servidor, cuja timezone
 * não é a do escritório, e um `"2026-08-13T00:00:00"` sem fuso seria lido pelo
 * Postgres como UTC — o mesmo erro de 3 horas que a migration 33 corrigiu.
 * Fixo em -03:00 como em `lib/buscaprocessos/sync.ts`: o Brasil não tem
 * horário de verão desde 2019.
 */
const OFFICE_UTC_OFFSET = '-03:00'

/** Primeiro e último instante de um dia (yyyy-MM-dd) no fuso do escritório. */
export function officeDayStart(day: string): string {
  return `${day}T00:00:00${OFFICE_UTC_OFFSET}`
}

export function officeDayEnd(day: string): string {
  return `${day}T23:59:59.999${OFFICE_UTC_OFFSET}`
}

/**
 * Condição `ilike` para dentro de um `.or()` do PostgREST, com o termo que o
 * MODELO escreveu. Vírgula, parênteses e ponto têm significado na sintaxe do
 * `or` (um CNJ tem pontos), e `%`/`_` são curingas do LIKE: os curingas e as
 * aspas saem, e o valor vai entre aspas duplas, como a doc do PostgREST manda
 * para valores com caracteres reservados.
 */
export function ilikeFilter(column: string, term: string): string {
  const safe = term.replace(/[%_"\\]/g, ' ').trim()
  return `${column}.ilike."%${safe}%"`
}

/** Nome de exibição de um cliente a partir das colunas cruas — o mesmo
 * critério de `getClientDisplayName`, sem exigir o tipo inteiro. */
export function clientLabel(row: {
  type?: string | null
  name?: string | null
  company_name?: string | null
  trade_name?: string | null
} | null | undefined): string | null {
  if (!row) return null
  if (row.type === 'company') return row.trade_name || row.company_name || null
  return row.name || row.company_name || null
}

/** Padrão de erro devolvido ao modelo. Mensagem do Postgres não vai para o
 * chat: o usuário não tem o que fazer com ela, e o log do servidor já a tem. */
export function toolError(context: string, error: { code?: string; message: string }) {
  console.error(`[ia] tool ${context} falhou:`, error.code, error.message)
  return { error: `Não foi possível consultar ${context}.` }
}
