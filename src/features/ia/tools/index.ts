import type { InferUITools, UIMessage } from 'ai'
import type { ScreenContext } from '../context/screenContext'
import { actionTools } from './actions'
import { createAgendaTools } from './read/agenda'
import { createClientTools } from './read/clients'
import { createFileTools, type FileToolsContext } from './read/files'
import { createFinancialTools } from './read/financial'
import { createHearingTools } from './read/hearings'
import { createProcessTools } from './read/processes'
import { createPublicationTools } from './read/publications'
import { createTeamTools } from './read/team'
import type { ToolClient } from './shared'
import { createDocxTools } from './docx'
import { createPdfTools } from './pdf'
import { createTemplateTools, type TemplateToolsContext } from './templates'
import { createContractTools } from './contracts'

export type AssistantToolsContext = FileToolsContext & TemplateToolsContext

/**
 * Conjunto completo de tools de um turno. As de leitura fecham sobre o client
 * do usuário; as de ação não executam no servidor (ver `actions.ts`).
 *
 * A ordem é fixa de propósito: a lista de tools entra no prefixo do prompt, e
 * um prefixo estável é o que faz o cache do provedor acertar entre turnos.
 */
export function createAssistantTools(supabase: ToolClient, context: AssistantToolsContext) {
  return {
    ...createClientTools(supabase),
    ...createProcessTools(supabase),
    ...createAgendaTools(supabase),
    ...createHearingTools(supabase),
    ...createPublicationTools(supabase),
    ...createFinancialTools(supabase),
    ...createTeamTools(supabase, context.userId),
    ...createFileTools(supabase, context),
    ...createTemplateTools(supabase, context),
    ...createContractTools(supabase, context),
    ...createDocxTools(supabase, context),
    ...createPdfTools(supabase, context),
    ...actionTools,
  }
}

export type AssistantTools = ReturnType<typeof createAssistantTools>

/** Partes de dados do chat. `context` é a tela de onde a pergunta saiu, pelo
 * painel do Assistente (ver `context/screenContext.ts`). Alias, não interface:
 * só o alias satisfaz o `Record<string, unknown>` que o `UIMessage` exige. */
export type AssistantDataTypes = {
  context: ScreenContext
}

/** Mensagem tipada do chat: `parts` conhece cada tool pelo nome. É o que a
 * tela renderiza e o que vai para `ai_messages.parts`. */
export type AssistantUIMessage = UIMessage<never, AssistantDataTypes, InferUITools<AssistantTools>>
