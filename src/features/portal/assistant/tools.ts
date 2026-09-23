import { tool, type InferUITools, type UIDataTypes, type UIMessage } from 'ai'
import { z } from 'zod'
import { getPortalProcessTimeline } from '@/lib/clientPortal/data'
import type { PortalProcessTimeline } from '@/types/clientPortal.types'
import { formatOfficeDate } from './prompt'

/** Teto do texto de UM ato enviado ao modelo. Movimentação comum tem uma
 * linha; o que passa disso é publicação liberada ao cliente, que pode trazer a
 * sentença inteira. O começo basta para explicar o ato, e o texto completo
 * continua na página. */
const MAX_MOVEMENT_CHARS = 12_000

function clip(text: string): string {
  if (text.length <= MAX_MOVEMENT_CHARS) return text
  return `${text.slice(0, MAX_MOVEMENT_CHARS)}… [o texto continua na página]`
}

function timelineForModel(timeline: PortalProcessTimeline) {
  return {
    movimentacoes: timeline.movements.map((movement) => ({
      data: formatOfficeDate(movement.movement_date),
      titulo: movement.title ?? undefined,
      texto: clip(movement.description),
    })),
    // A página também para nas 50 mais recentes; o modelo precisa saber que
    // existem outras para não tratar a mais antiga daqui como o início.
    ha_movimentacoes_mais_antigas: timeline.truncated,
  }
}

/**
 * As tools do assistente do portal: uma só, de leitura.
 *
 * ⚠️ `clientId` vem do link validado pela rota, NUNCA do modelo. O id do
 * processo, esse sim escolhido pelo modelo, passa pela mesma reconferência de
 * vínculo da rota da timeline (`getPortalProcessTimeline`): pedir um processo
 * de outro cliente devolve "não encontrado", igual a um id que não existe.
 *
 * A lista de processos não é tool: vai no prompt, porque quase toda pergunta
 * começa por ela e uma ida e volta a menos é uma requisição a menos na cota do
 * provedor.
 */
export function createPortalAssistantTools(clientId: string) {
  return {
    ver_andamento: tool({
      description:
        'Movimentações publicadas de UM processo do cliente, da mais recente para a mais antiga ' +
        '(até 50, as mesmas que a página mostra). Use o id que aparece em "Processos do cliente".',
      inputSchema: z.object({
        processo_id: z.string().uuid().describe('O id do processo, da lista "Processos do cliente".'),
      }),
      execute: async ({ processo_id }) => {
        try {
          const timeline = await getPortalProcessTimeline(clientId, processo_id)
          if (!timeline) return { erro: 'Processo não encontrado entre os processos deste link.' }
          return timelineForModel(timeline)
        } catch {
          // `getPortalProcessTimeline` já registrou o motivo no log.
          return { erro: 'Não foi possível consultar o andamento agora.' }
        }
      },
    }),
  }
}

export type PortalAssistantTools = ReturnType<typeof createPortalAssistantTools>

/** Mensagem do chat do portal: é o que a página renderiza e o que vai para
 * `client_portal_chat_messages.parts`. */
export type PortalAssistantUIMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<PortalAssistantTools>
>
