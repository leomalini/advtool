import { z } from 'zod'

/**
 * O resultado da triagem de uma publicação (fase 5), como o modelo o devolve
 * pela tool do lote. Sem limites de tamanho ou de número no esquema: a saída
 * estruturada da Anthropic não aceita esses campos — a faixa do prazo é
 * conferida na gravação.
 */
export const triageResultSchema = z.object({
  tipo_do_ato: z
    .string()
    .describe('Nome curto do ato: "Intimação para manifestação", "Sentença", "Despacho".'),
  urgencia: z
    .enum(['alta', 'media', 'baixa'])
    .describe('alta: prazo curto, audiência, citação, bloqueio. baixa: só registro, sem providência.'),
  pede_providencia: z.boolean().describe('Se o ato pede alguma providência do escritório.'),
  resumo: z.string().describe('Uma ou duas frases: o que o ato diz e a quem se dirige.'),
  tarefa_sugerida: z
    .string()
    .nullable()
    .describe('A providência como título de tarefa ("Manifestar sobre o laudo"), ou null.'),
  // Sem `.int()`: no zod 4 ele põe `minimum`/`maximum` de inteiro seguro no
  // esquema, e o modo `strict` da Anthropic recusa o pedido inteiro. A
  // gravação arredonda e confere a faixa.
  prazo_dias: z
    .number()
    .nullable()
    .describe('Prazo em dias QUE O TEXTO DÁ, número inteiro, ou null. Nunca deduza.'),
  prazo_contagem: z
    .enum(['uteis', 'corridos'])
    .nullable()
    .describe('uteis para prazo processual (CPC art. 219); null sem prazo.'),
  processo_provavel_id: z
    .string()
    .nullable()
    .describe('Só para publicação sem processo: o id de um dos candidatos, ou null.'),
  processo_provavel_motivo: z
    .string()
    .nullable()
    .describe('Por que esse candidato (partes, número de origem), ou null.'),
})

export type TriageResult = z.infer<typeof triageResultSchema>
