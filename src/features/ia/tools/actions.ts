import { tool, type InferUITool } from 'ai'
import { z } from 'zod'
import { taskPrioritySchema } from '@/schemas/task.schema'
import { documentCategorySchema } from '@/schemas/document.schema'
import { templateCategorySchema } from '@/schemas/documentTemplate.schema'
import { contractKindSchema } from '@/schemas/contract.schema'
import { partyToolDataSchema } from '@/features/contratos/utils/partyToolInput'
import { SOURCE_KINDS } from '@/types/contract.types'

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

// ── Contratos (docs/contratos.md, fase 3) ────────────────────────────────────

/** Uma parte do contrato a registrar — a mesma forma de gerar_contrato. */
const contractPartyActionSchema = z.object({
  papel: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40),
  papel_rotulo: z.string().max(60).describe('Nome do papel, ex.: Locatário.'),
  cliente_id: z.string().uuid().optional(),
  escritorio: z.boolean().optional(),
  dados: partyToolDataSchema.optional(),
  /** Para o card de confirmação. */
  nome: z.string().max(200).describe('Nome da parte, para exibição.'),
})

export const contractActionTools = {
  cadastrar_cliente: tool({
    description:
      'Propõe cadastrar como CLIENTE uma pessoa lida de documentos (ou informada pelo usuário). ' +
      'Exige CPF/CNPJ. O usuário confere na tela. Antes, veja se já não é cliente ' +
      '(ler_documentos aponta "cliente_cadastrado"; ou buscar_clientes) — se for, use ' +
      'completar_cliente. Só para quem é cliente do escritório, não para a outra parte.',
    inputSchema: z.object({
      dados: partyToolDataSchema,
    }),
    outputSchema: actionOutputSchema,
  }),

  completar_cliente: tool({
    description:
      'Propõe completar o cadastro de um cliente existente com dados lidos de documentos: só ' +
      'os campos VAZIOS são preenchidos — nada que já está no cadastro muda. O usuário confirma.',
    inputSchema: z.object({
      cliente_id: z.string().uuid(),
      cliente_nome: z.string().describe('Nome do cliente, para exibição.'),
      dados: partyToolDataSchema,
    }),
    outputSchema: actionOutputSchema,
  }),

  registrar_contrato: tool({
    description:
      'Propõe registrar o contrato em Contratos, como rascunho (ou aguardando assinatura): ' +
      'tipo, nome, cliente, números, as partes e os arquivos desta conversa — a minuta gerada ' +
      'e os documentos lidos que o usuário quiser guardar. O usuário confirma. Nunca registre ' +
      'como assinado: isso o usuário faz na tela, com a data e a via assinada.',
    inputSchema: z.object({
      tipo: contractKindSchema,
      titulo: z.string().min(1).max(200),
      status: z.enum(['rascunho', 'aguardando_assinatura']).optional(),
      cliente_id: z.string().uuid().optional(),
      processo_id: z.string().uuid().optional(),
      modelo_id: z.string().uuid().optional().describe('Modelo usado na minuta.'),
      valor_total: z.number().nonnegative().optional(),
      parcelas: z.number().int().min(1).max(360).optional(),
      primeiro_vencimento: dateSchema.optional(),
      exito_percentual: z.number().min(0).max(100).optional(),
      inicio: dateSchema.optional(),
      fim: dateSchema.optional(),
      reajuste: z.string().max(40).optional(),
      partes: z.array(contractPartyActionSchema).max(10),
      minuta_arquivo_id: z
        .string()
        .uuid()
        .optional()
        .describe('A minuta gerada por gerar_contrato nesta conversa.'),
      anexos: z
        .array(
          z.object({
            arquivo_id: z.string().uuid().describe('Anexo desta conversa.'),
            tipo: z.enum(SOURCE_KINDS as [string, ...string[]]).optional(),
            parte: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe('Índice (a partir de 0) da parte de quem é o documento.'),
          }),
        )
        .max(10)
        .optional()
        .describe('Documentos lidos que o usuário quer guardar no contrato.'),
      ...displayFields,
    }),
    outputSchema: actionOutputSchema,
  }),
}

// ── Ações das telas (docs/assistente-claude.md, fase 4c) ─────────────────────

/** Rótulo da publicação para o card ("#115 · Decisão · 27/08/2026"). */
const publicationLabel = z.string().max(200).describe('Número e tipo da publicação, para exibição.')

export const screenActionTools = {
  concluir_tarefa: tool({
    description: 'Propõe marcar uma tarefa como concluída. O usuário confirma na tela.',
    inputSchema: z.object({
      tarefa_id: z.string().uuid(),
      tarefa_titulo: z.string().max(200).describe('Título da tarefa, para exibição.'),
    }),
    outputSchema: actionOutputSchema,
  }),

  reatribuir_tarefa: tool({
    description:
      'Propõe passar uma tarefa para outro responsável (id de membros_do_escritorio). Numa ' +
      'tarefa que se repete, muda só esta ocorrência. O usuário confirma.',
    inputSchema: z.object({
      tarefa_id: z.string().uuid(),
      tarefa_titulo: z.string().max(200).describe('Título da tarefa, para exibição.'),
      responsavel_id: z.string().uuid(),
      responsavel_nome: z.string().max(200).describe('Nome do novo responsável, para exibição.'),
    }),
    outputSchema: actionOutputSchema,
  }),

  remarcar_evento: tool({
    description:
      'Propõe mudar a data e o horário de um compromisso da Agenda (id de eventos_no_periodo), ' +
      'como arrastar na Agenda: a duração se mantém, a não ser que você informe o término. ' +
      'Num compromisso que se repete, muda só esta ocorrência. Em audiência, a nova data entra ' +
      'no histórico da ficha e passa a contar como conferida. Vencimento de contrato não se ' +
      'remarca por aqui: muda pelo contrato. O usuário confirma.',
    inputSchema: z.object({
      evento_id: z.string().uuid(),
      evento_titulo: z.string().max(200).describe('Título do compromisso, para exibição.'),
      quando_era: z.string().max(60).describe('Data e hora atuais, para exibição.'),
      data: dateSchema,
      hora: timeSchema.optional().describe('Omitir para dia inteiro.'),
      data_fim: dateSchema.optional(),
      hora_fim: timeSchema.optional(),
    }),
    outputSchema: actionOutputSchema,
  }),

  criar_audiencia: tool({
    description:
      'Propõe criar a ficha de uma audiência num processo. `tipo_id` vem de tipos_de_audiencia. ' +
      'Com data e hora, o compromisso entra na Agenda com a duração do tipo; sem data, a ' +
      'audiência fica na lista "Sem data". O usuário confirma.',
    inputSchema: z.object({
      processo_id: z.string().uuid(),
      tipo_id: z.string().min(1),
      tipo_nome: z.string().max(80).describe('Tipo da audiência, para exibição.'),
      data: dateSchema.optional(),
      hora: timeSchema.optional(),
      modalidade: z.enum(['presencial', 'virtual', 'hibrida']).optional(),
      processo_cnj: displayFields.processo_cnj,
    }),
    outputSchema: actionOutputSchema,
  }),

  registrar_lancamento: tool({
    description:
      'Propõe registrar um lançamento no Financeiro (receita ou despesa). Com vencimento é um ' +
      'lançamento com data; sem data, descreva a condição para o recebimento (ex.: "no êxito ' +
      'da ação"). Valores só os que o usuário informou. O usuário confirma.',
    inputSchema: z.object({
      tipo: z.enum(['receita', 'despesa']),
      categoria: z.enum(['honorario', 'custas', 'pericia', 'outros']),
      descricao: z.string().min(1).max(300),
      valor: z.number().positive(),
      situacao: z.enum(['pendente', 'pago']),
      vencimento: dateSchema.optional(),
      condicao: z
        .string()
        .max(300)
        .optional()
        .describe('Quando não há vencimento: a condição para o recebimento.'),
      pago_em: dateSchema.optional().describe('Só com situação "pago".'),
      cliente_id: z.string().uuid().optional(),
      processo_id: z.string().uuid().optional(),
      cliente_nome: displayFields.cliente_nome,
      processo_cnj: displayFields.processo_cnj,
    }),
    outputSchema: actionOutputSchema,
  }),

  vincular_publicacao: tool({
    description:
      'Propõe ligar uma publicação a um processo cadastrado. Se o CNJ da publicação for ' +
      'diferente do processo (recurso, incidente), diga isso ao usuário antes. O usuário confirma.',
    inputSchema: z.object({
      publicacao_id: z.string().uuid(),
      publicacao_rotulo: publicationLabel,
      publicacao_cnj: z.string().max(40).optional().describe('CNJ que veio na publicação.'),
      processo_id: z.string().uuid(),
      processo_cnj: displayFields.processo_cnj,
    }),
    outputSchema: actionOutputSchema,
  }),

  tratar_publicacao: tool({
    description:
      'Propõe marcar uma publicação como tratada (e lida). Só quando o usuário disser que a ' +
      'providência foi tomada ou pedir para marcar. O usuário confirma.',
    inputSchema: z.object({
      publicacao_id: z.string().uuid(),
      publicacao_rotulo: publicationLabel,
    }),
    outputSchema: actionOutputSchema,
  }),

  enviar_para_assinatura: tool({
    description:
      'Propõe enviar um arquivo para assinatura eletrônica pela D4Sign. SÓ quando o usuário ' +
      'pedir o envio, nunca por iniciativa sua. Informe o arquivo (PDF ou Word): de um contrato ' +
      '(ver_contrato → arquivos, com contrato_id) ou um documento avulso (listar_documentos). ' +
      'Quem assina NÃO vem de você: são as partes do contrato, ou o cliente do documento, ' +
      'como na tela. O card mostra a lista e pede uma segunda confirmação; quem quiser outra ' +
      'lista envia pela tela.',
    inputSchema: z.object({
      documento_id: z.string().uuid(),
      documento_nome: z.string().max(200).describe('Nome do arquivo, para exibição.'),
      contrato_id: z.string().uuid().optional(),
      mensagem: z.string().max(1000).optional().describe('Texto do e-mail, se o usuário pediu.'),
      prazo: dateSchema.optional().describe('Data-limite para assinar, se o usuário pediu.'),
    }),
    outputSchema: actionOutputSchema,
  }),

  gerar_link_pagamento: tool({
    description:
      'Propõe gerar o link de pagamento da InfinitePay para um lançamento a receber pendente ' +
      '(id de listar_lancamentos). SÓ quando o usuário pedir. O link não é enviado a ninguém: ' +
      'ele volta aqui e no lançamento, para o usuário mandar. O card pede uma segunda ' +
      'confirmação.',
    inputSchema: z.object({
      lancamento_id: z.string().uuid(),
      lancamento_descricao: z.string().max(300).describe('Descrição, para exibição.'),
      valor: z.number().positive().optional().describe('Valor, para exibição.'),
      cliente_nome: displayFields.cliente_nome,
    }),
    outputSchema: actionOutputSchema,
  }),
}

/** As ações que gravam fora do escritório (e-mail aos signatários, cobrança):
 * o card pede uma segunda confirmação. */
export const REINFORCED_ACTION_TOOLS = ['enviar_para_assinatura', 'gerar_link_pagamento'] as const

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

  cadastrar_modelo: tool({
    description:
      'Propõe cadastrar um .docx anexado nesta conversa como modelo de documento do escritório ' +
      '(Documentos → Modelos; os de contrato, em Contratos → Modelos), para reutilizar. O ' +
      'usuário confirma na tela. Os campos entre ' +
      'chaves são lidos do arquivo; quais são manuais e quais a IA redige se ajusta depois, na ' +
      'tela do modelo.',
    inputSchema: z.object({
      arquivo_id: z.string().uuid(),
      arquivo_nome: z.string().describe('Nome do arquivo, para exibição.'),
      nome: z.string().min(1).max(120).describe('Nome do modelo.'),
      categoria: templateCategorySchema,
      descricao: z
        .string()
        .max(500)
        .optional()
        .describe('Quando usar o modelo — ajuda a escolher o modelo certo depois.'),
    }),
    outputSchema: actionOutputSchema,
  }),

  ...contractActionTools,
  ...screenActionTools,
}

export type ActionToolName = keyof typeof actionTools

/** O input de uma ação, como o card e o executor recebem. */
export type ActionInput<N extends ActionToolName> = InferUITool<(typeof actionTools)[N]>['input']
export const ACTION_TOOL_NAMES = Object.keys(actionTools) as ActionToolName[]
