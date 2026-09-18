'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferUITool } from 'ai'
import { useAuth } from '@/hooks/useAuth'
import { createTask } from '@/features/tarefas/services/tasks.service'
import { useInvalidateTaskSurfaces } from '@/features/tarefas/hooks/useTaskMutations'
import { createEvent } from '@/features/agenda/services/events.service'
import { useInvalidateEventSurfaces } from '@/features/agenda/hooks/useEventMutations'
import { addClientComment } from '@/features/clientes/services/clientes.service'
import { clientKeys } from '@/features/clientes/hooks/useClientes'
import { addLegalProcessMovement } from '@/features/processos/services/legalProcesses.service'
import { useInvalidateLegalProcesses } from '@/features/processos/hooks/useLegalProcessMutations'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { uploadDocument } from '@/features/documentos/services/documents.service'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { downloadAiFileAsFile } from '../services/aiFiles.service'
import type { ActionOutput, ActionToolName, actionTools } from '../tools/actions'

type ActionInput<N extends ActionToolName> = InferUITool<(typeof actionTools)[N]>['input']

export type PendingAction =
  | { tool: 'criar_tarefa'; input: ActionInput<'criar_tarefa'> }
  | { tool: 'criar_evento'; input: ActionInput<'criar_evento'> }
  | { tool: 'comentar_cliente'; input: ActionInput<'comentar_cliente'> }
  | { tool: 'registrar_movimentacao'; input: ActionInput<'registrar_movimentacao'> }
  | { tool: 'salvar_em_documentos'; input: ActionInput<'salvar_em_documentos'> }

/**
 * Executa uma ação proposta pela IA depois que o usuário confirmou.
 *
 * Chama os MESMOS services das telas — nada de insert próprio — para que a
 * RLS, o feed de atividades, a recorrência e as demais regras valham igual.
 * A invalidação de cache também é a de cada módulo, por isso os helpers
 * `useInvalidate*Surfaces` em vez de uma lista de keys aqui.
 */
export function useExecuteAction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidateTasks = useInvalidateTaskSurfaces()
  const invalidateEvents = useInvalidateEventSurfaces()
  const invalidateProcesses = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: async (action: PendingAction): Promise<ActionOutput> => {
      const userId = user!.id

      switch (action.tool) {
        case 'criar_tarefa': {
          const { input } = action
          const task = await createTask(
            {
              title: input.titulo,
              description: input.descricao,
              priority: input.prioridade,
              due_date: input.vencimento ?? null,
              due_time: input.hora ?? null,
              assigned_to: input.responsavel_id ?? null,
              client_id: input.cliente_id ?? null,
              legal_process_id: input.processo_id ?? null,
            },
            userId,
          )
          invalidateTasks()
          return { ok: true, id: task.id, link: '/tarefas' }
        }

        case 'criar_evento': {
          const { input } = action
          const event = await createEvent(
            {
              title: input.titulo,
              type: input.tipo,
              client_id: input.cliente_id ?? '',
              legal_process_id: input.processo_id ?? null,
              crm_item_id: null,
              assignee_ids: input.responsaveis_ids,
              start_date: input.data,
              start_time: input.hora,
              fatal_deadline_date: input.prazo_fatal,
              show_in_agenda: true,
              all_day: !input.hora,
              inform_end: Boolean(input.data_fim),
              end_date: input.data_fim,
              end_time: input.hora_fim,
              location: input.local,
              description: input.descricao,
              is_important: input.importante ?? false,
              is_urgent: input.urgente ?? false,
              is_future: false,
              is_retroactive: false,
            },
            userId,
          )
          invalidateEvents()
          return { ok: true, id: event.id, link: '/agenda' }
        }

        case 'comentar_cliente': {
          const { input } = action
          const comment = await addClientComment(
            input.cliente_id,
            input.comentario,
            userId,
            input.cliente_nome,
          )
          queryClient.invalidateQueries({ queryKey: clientKeys.comments(input.cliente_id) })
          queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
          return { ok: true, id: comment.id, link: `/clientes/${input.cliente_id}` }
        }

        case 'registrar_movimentacao': {
          const { input } = action
          const movement = await addLegalProcessMovement(
            input.processo_id,
            input.descricao,
            input.data,
          )
          queryClient.invalidateQueries({ queryKey: legalProcessKeys.detail(input.processo_id) })
          invalidateProcesses()
          return { ok: true, id: movement.id, link: `/processos/${input.processo_id}` }
        }

        case 'salvar_em_documentos': {
          const { input } = action
          // `documents` exige ao menos um vínculo (chk_documents_has_parent);
          // falhar aqui dá uma mensagem melhor que a violação do CHECK.
          if (!input.cliente_id && !input.processo_id) {
            throw new Error('Informe o cliente ou o processo.')
          }
          const file = await downloadAiFileAsFile(input.arquivo_id)
          const document = await uploadDocument(
            {
              category: input.categoria,
              client_id: input.cliente_id ?? null,
              legal_process_id: input.processo_id ?? null,
              crm_item_id: null,
              event_id: null,
            },
            file,
            userId,
          )
          queryClient.invalidateQueries({ queryKey: documentKeys.all })
          queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
          return {
            ok: true,
            id: document.id,
            link: input.processo_id ? `/processos/${input.processo_id}` : `/clientes/${input.cliente_id}`,
          }
        }
      }
    },
  })
}
