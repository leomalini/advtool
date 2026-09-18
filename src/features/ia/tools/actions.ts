import { tool } from 'ai'
import { z } from 'zod'
import { taskPrioritySchema } from '@/schemas/task.schema'
import { documentCategorySchema } from '@/schemas/document.schema'

/**
 * Ações que a IA pode PROPOR. Nenhuma tem `execute`: a chamada volta ao
 * browser, a tela mostra um card de confirmação e só depois do clique o
 * service do módulo correspondente (`createTask`, `createEvent`…) grava —
 * pelo mesmo caminho da tela, com a RLS do usuário, o feed de atividades e a
 * invalidação de cache que já existem. Reexecutar isso no servidor duplicaria
 * essas regras.
 *
 * Os schemas são um subconjunto dos de formulário (`task.schema.ts`,
 * `event.schema.ts`): só o que faz sentido a IA preencher.
 */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd')
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm')

/** Rótulos só para o card de confirmação: o usuário confirma "Maria Silva",
 * não um uuid. Vêm das tools de busca junto com os ids. */
const displayFields = {
  cliente_nome: z.string().optional().describe('Nome do cliente, para exibição.'),
  processo_cnj: z.string().optional().describe('CNJ do processo, para exibição.'),
  responsavel_nome: z.string().optional().describe('Nome do responsável, para exibição.'),
}

/** O que a tela devolve ao modelo depois da confirmação (ou do cancelamento).
 * Tool sem `execute` exige o schema da saída — é por ele que o chat tipa o
 * `addToolOutput`. */
const actionOutputSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), id: z.string(), link: z.string().optional() }),
  z.object({ ok: z.literal(false), motivo: z.string() }),
])

export type ActionOutput = z.infer<typeof actionOutputSchema>

export const actionTools = {
  criar_tarefa: tool({
    description:
      'Propõe criar uma tarefa. O usuário confirma na tela antes de gravar. Resolva ids de ' +
      'cliente/processo/responsável com as tools de busca antes de chamar.',
    inputSchema: z.object({
      titulo: z.string().min(1).max(200),
      descricao: z.string().max(2000).optional(),
      prioridade: taskPrioritySchema.optional(),
      vencimento: dateSchema.optional(),
      hora: timeSchema.optional(),
      responsavel_id: z.string().uuid().optional(),
      cliente_id: z.string().uuid().optional(),
      processo_id: z.string().uuid().optional(),
      ...displayFields,
    }),
    outputSchema: actionOutputSchema,
  }),

  criar_evento: tool({
    description:
      'Propõe criar um compromisso na Agenda (audiência, prazo, reunião…). O usuário confirma ' +
      'na tela. `tipo` é o id de um item de `tipos_de_evento`; `responsaveis_ids` vem de ' +
      '`membros_do_escritorio` (se o usuário não disser, use o próprio usuário).',
    inputSchema: z.object({
      titulo: z.string().min(1).max(200),
      tipo: z.string().min(1),
      tipo_nome: z.string().optional().describe('Rótulo do tipo, para exibição.'),
      data: dateSchema,
      hora: timeSchema.optional().describe('Omitir para dia inteiro.'),
      data_fim: dateSchema.optional(),
      hora_fim: timeSchema.optional(),
      local: z.string().max(200).optional(),
      descricao: z.string().max(2000).optional(),
      prazo_fatal: dateSchema.optional(),
      responsaveis_ids: z.array(z.string().uuid()).min(1),
      cliente_id: z.string().uuid().optional(),
      processo_id: z.string().uuid().optional(),
      importante: z.boolean().optional(),
      urgente: z.boolean().optional(),
      ...displayFields,
    }),
    outputSchema: actionOutputSchema,
  }),

  comentar_cliente: tool({
    description: 'Propõe registrar um comentário na ficha de um cliente. O usuário confirma na tela.',
    inputSchema: z.object({
      cliente_id: z.string().uuid(),
      cliente_nome: z.string().describe('Nome do cliente, para exibição e para o feed.'),
      comentario: z.string().min(1).max(2000),
    }),
    outputSchema: actionOutputSchema,
  }),

  registrar_movimentacao: tool({
    description:
      'Propõe registrar uma movimentação manual num processo (andamento, despacho, providência). ' +
      'O usuário confirma na tela.',
    inputSchema: z.object({
      processo_id: z.string().uuid(),
      processo_cnj: z.string().optional().describe('CNJ, para exibição.'),
      descricao: z.string().min(1).max(4000),
      data: dateSchema.describe('Data da movimentação.'),
    }),
    outputSchema: actionOutputSchema,
  }),

  salvar_em_documentos: tool({
    description:
      'Propõe salvar um arquivo desta conversa (anexo enviado ou arquivo gerado) no módulo ' +
      'Documentos, vinculado a um cliente e/ou processo — informe ao menos um dos dois. O ' +
      'usuário confirma na tela.',
    inputSchema: z.object({
      arquivo_id: z.string().uuid(),
      arquivo_nome: z.string().describe('Nome do arquivo, para exibição.'),
      categoria: documentCategorySchema,
      cliente_id: z.string().uuid().optional(),
      processo_id: z.string().uuid().optional(),
      cliente_nome: displayFields.cliente_nome,
      processo_cnj: displayFields.processo_cnj,
    }),
    outputSchema: actionOutputSchema,
  }),
}

export type ActionToolName = keyof typeof actionTools
export const ACTION_TOOL_NAMES = Object.keys(actionTools) as ActionToolName[]
