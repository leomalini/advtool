import { tool } from 'ai'
import { z } from 'zod'
import { dateSchema, ilikeFilter, limitSchema, toolError, type ToolClient } from '../shared'

const SELECT =
  'id, sequence_number, publication_date, court, diario_name, title, subject, excerpt, ' +
  'content_text, cnj_number, legal_process_id, deadline_start_at, read_at, handled_at'

/** O texto integral de um diário é longo; para listar, um trecho basta — o
 * modelo pede a íntegra pelo id quando precisa. */
const EXCERPT_LENGTH = 400

/** O parser de tipos do PostgREST desiste em selects longos e devolve
 * `GenericStringError`; o formato real é este. */
type Row = {
  id: string
  sequence_number: number
  publication_date: string
  court: string | null
  diario_name: string | null
  title: string | null
  subject: string | null
  excerpt: string | null
  content_text: string | null
  cnj_number: string | null
  legal_process_id: string | null
  deadline_start_at: string | null
  read_at: string | null
  handled_at: string | null
}

export function createPublicationTools(supabase: ToolClient) {
  return {
    listar_publicacoes: tool({
      description:
        'Publicações/intimações recebidas dos diários oficiais, mais recentes primeiro. ' +
        'Filtre por não lidas, não tratadas, período ou processo.',
      inputSchema: z.object({
        somente_nao_lidas: z.boolean().optional(),
        somente_nao_tratadas: z.boolean().optional(),
        de: dateSchema.optional(),
        ate: dateSchema.optional(),
        processo_id: z.string().uuid().optional(),
        termo: z.string().max(120).optional().describe('Trecho do título, conteúdo ou CNJ.'),
        limite: limitSchema,
      }),
      execute: async (input) => {
        let query = supabase
          .from('publications')
          .select(SELECT)
          .is('duplicate_of_id', null)
          .order('publication_date', { ascending: false })
          .order('sequence_number', { ascending: false })
          .limit(input.limite ?? 10)

        if (input.somente_nao_lidas) query = query.is('read_at', null)
        if (input.somente_nao_tratadas) query = query.is('handled_at', null)
        if (input.de) query = query.gte('publication_date', input.de)
        if (input.ate) query = query.lte('publication_date', input.ate)
        if (input.processo_id) query = query.eq('legal_process_id', input.processo_id)
        const term = input.termo?.trim()
        if (term) {
          query = query.or(
            ['title', 'content_text', 'cnj_number']
              .map((column) => ilikeFilter(column, term))
              .join(','),
          )
        }

        const { data, error } = await query
        if (error) return toolError('as publicações', error)

        return {
          publicacoes: ((data ?? []) as unknown as Row[]).map((p) => ({
            id: p.id,
            numero: p.sequence_number,
            data: p.publication_date,
            tribunal: p.court,
            diario: p.diario_name,
            titulo: p.title,
            assunto: p.subject,
            trecho: (p.excerpt ?? p.content_text ?? '').slice(0, EXCERPT_LENGTH),
            cnj: p.cnj_number,
            processo_id: p.legal_process_id,
            inicio_do_prazo: p.deadline_start_at,
            lida: p.read_at != null,
            tratada: p.handled_at != null,
          })),
        }
      },
    }),

    ler_publicacao: tool({
      description: 'Texto integral de uma publicação pelo id.',
      inputSchema: z.object({ publicacao_id: z.string().uuid() }),
      execute: async ({ publicacao_id }) => {
        const { data, error } = await supabase
          .from('publications')
          .select(SELECT)
          .eq('id', publicacao_id)
          .maybeSingle()
        if (error) return toolError('a publicação', error)
        if (!data) return { error: 'Publicação não encontrada ou sem acesso.' }
        const row = data as unknown as Row
        return {
          id: row.id,
          data: row.publication_date,
          tribunal: row.court,
          titulo: row.title,
          cnj: row.cnj_number,
          processo_id: row.legal_process_id,
          inicio_do_prazo: row.deadline_start_at,
          conteudo: row.content_text,
        }
      },
    }),
  }
}
