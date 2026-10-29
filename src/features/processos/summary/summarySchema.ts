import { z } from 'zod'

/**
 * O resumo do processo como o Claude o devolve e como fica gravado em
 * `legal_process_summaries.summary` (migration 82).
 *
 * Toda afirmação traz as referências que a sustentam ([M3], [P1], [A1]…), as
 * mesmas que a mensagem ao modelo usa para cada item do processo. É isso que
 * deixa o advogado conferir o resumo contra a fonte em vez de confiar nele.
 */

const sourcesSchema = z
  .array(z.string())
  .describe('Referências dos dados que sustentam a afirmação, ex.: ["M12", "P1"].')

const citedTextSchema = z.object({ texto: z.string(), fontes: sourcesSchema })

export const processSummarySchema = z.object({
  fase_atual: citedTextSchema,
  ultimo_ato: z.object({
    data: z.string().describe('dd/mm/aaaa'),
    descricao: z.string(),
    fonte: z.string(),
  }),
  resumo: z.array(citedTextSchema),
  pontos_de_atencao: z.array(citedTextSchema),
  proximos_passos_registrados: z.array(
    z.object({
      data: z.string().nullable().describe('dd/mm/aaaa, ou null sem data'),
      descricao: z.string(),
      fonte: z.string(),
    }),
  ),
})

export type ProcessSummary = z.infer<typeof processSummarySchema>

export type SummarySourceKind = 'capa' | 'movement' | 'publication' | 'hearing' | 'task' | 'event'

/** O que uma referência era na hora da geração — o que a tela mostra ao passar
 * o mouse e o que leva ao item da linha do tempo. */
export interface SummarySource {
  ref: string
  kind: SummarySourceKind
  /** Id da linha de origem; nulo na capa. */
  id: string | null
  /** dd/mm/aaaa, quando o item tem data. */
  date: string | null
  label: string
}

/** Uma linha de `legal_process_summaries`. */
export interface ProcessSummaryRecord {
  legal_process_id: string
  summary: ProcessSummary
  sources: SummarySource[]
  model: string
  generated_by: string | null
  generated_at: string
}
