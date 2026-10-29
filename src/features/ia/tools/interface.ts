import { tool } from 'ai'
import { z } from 'zod'

/**
 * Tools de interface (fase 4c): rodam no navegador, sem `execute` no
 * servidor. O chat recebe a chamada (`onToolCall` do `ChatPanel`), age na
 * tela e devolve o resultado ao modelo. Não gravam nada — por isso não passam
 * pelo card de confirmação.
 */

/** Registros que abrem pelo id. */
const RECORD_ROUTES = {
  processo: '/processos',
  cliente: '/clientes',
  pessoa: '/pessoas',
  contrato: '/contratos',
  publicacao: '/publicacoes',
} as const

/** Módulos que abrem pela lista. */
const MODULE_ROUTES = {
  dashboard: '/dashboard',
  agenda: '/agenda',
  audiencias: '/audiencias',
  tarefas: '/tarefas',
  processos: '/processos',
  movimentacoes: '/movimentacoes',
  publicacoes: '/publicacoes',
  clientes: '/clientes',
  pessoas: '/pessoas',
  contratos: '/contratos',
  financeiro: '/financeiro',
  documentos: '/documentos',
  pendencias: '/pendencias',
  crm: '/crm',
} as const

type RecordDestination = keyof typeof RECORD_ROUTES
type ModuleDestination = keyof typeof MODULE_ROUTES

const DESTINATIONS = [
  ...(Object.keys(RECORD_ROUTES) as RecordDestination[]),
  ...(Object.keys(MODULE_ROUTES) as ModuleDestination[]),
] as [RecordDestination | ModuleDestination, ...(RecordDestination | ModuleDestination)[]]

/** Os recortes que o Financeiro já lê da URL (`parseSituationFilter`). */
const FINANCIAL_SITUATIONS = ['a_receber', 'a_vencer', 'vencido', 'condicao_especial', 'pago'] as const

const openScreenInput = z.object({
  destino: z.enum(DESTINATIONS),
  id: z.string().uuid().optional().describe('Obrigatório para um registro (processo, cliente…).'),
  situacao: z
    .enum(FINANCIAL_SITUATIONS)
    .optional()
    .describe('Só no Financeiro: o recorte da lista.'),
  rotulo: z.string().max(120).describe('O que abre, para exibição ("Processo 5016795…").'),
})

export type OpenScreenInput = z.infer<typeof openScreenInput>

function isRecord(destination: string): destination is RecordDestination {
  return destination in RECORD_ROUTES
}

/** A rota do destino, ou `null` quando falta o id do registro. */
export function screenHref(input: OpenScreenInput): string | null {
  if (isRecord(input.destino)) {
    return input.id ? `${RECORD_ROUTES[input.destino]}/${input.id}` : null
  }
  const base = MODULE_ROUTES[input.destino]
  if (input.destino === 'financeiro' && input.situacao) return `${base}?situacao=${input.situacao}`
  return base
}

export const interfaceTools = {
  abrir_tela: tool({
    description:
      'Abre uma tela do AdvTool: um registro pelo id (processo, cliente, pessoa, contrato, ' +
      'publicação) ou um módulo (agenda, tarefas, financeiro…). No painel lateral a tela por ' +
      'trás muda na hora; na página do Assistente vira um link no chat. Só quando o usuário ' +
      'pedir para abrir, ver ou ir a algum lugar. Filtros da lista não vão junto, a não ser a ' +
      'situação no Financeiro.',
    inputSchema: openScreenInput,
    outputSchema: z.object({
      navegou: z.boolean(),
      link: z.string().describe('Vazio quando o destino não tinha o id do registro.'),
    }),
  }),
}

export const INTERFACE_TOOL_NAMES = Object.keys(interfaceTools) as (keyof typeof interfaceTools)[]
