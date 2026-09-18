import type { InferUITools, UIDataTypes, UIMessage } from 'ai'
import { actionTools } from './actions'
import { createAgendaTools } from './read/agenda'
import { createClientTools } from './read/clients'
import { createFileTools, type FileToolsContext } from './read/files'
import { createFinancialTools } from './read/financial'
import { createProcessTools } from './read/processes'
import { createPublicationTools } from './read/publications'
import { createTeamTools } from './read/team'
import type { ToolClient } from './shared'
import { createPdfTools } from './pdf'
import { createTemplateTools, type TemplateToolsContext } from './templates'

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
    ...createPublicationTools(supabase),
    ...createFinancialTools(supabase),
    ...createTeamTools(supabase),
    ...createFileTools(supabase, context),
    ...createTemplateTools(supabase, context),
    ...createPdfTools(supabase, context),
    ...actionTools,
  }
}

export type AssistantTools = ReturnType<typeof createAssistantTools>

/** Mensagem tipada do chat: `parts` conhece cada tool pelo nome. É o que a
 * tela renderiza e o que vai para `ai_messages.parts`. */
export type AssistantUIMessage = UIMessage<never, UIDataTypes, InferUITools<AssistantTools>>
