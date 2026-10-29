'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { createTask } from '@/features/tarefas/services/tasks.service'
import { useInvalidateTaskSurfaces } from '@/features/tarefas/hooks/useTaskMutations'
import { useInvalidateLegalProcesses } from '@/features/processos/hooks/useLegalProcessMutations'
import type { TaskPriority } from '@/types/task.types'
import type { PublicationWithRelations, TriageUrgency } from '@/types/publication.types'
import {
  linkPublicationToProcess,
  updateTriageSuggestion,
} from '../services/publications.service'
import { useInvalidatePublications } from './usePublications'

const PRIORITY_BY_URGENCY: Record<TriageUrgency, TaskPriority> = {
  alta: 'high',
  media: 'medium',
  baixa: 'low',
}

/**
 * A sugestão da triagem vira tarefa (fase 5) — pelo `createTask` da tela, com
 * o vencimento que o motor de prazos calculou (nunca o modelo) e ligada à
 * publicação e ao processo. Quem confirma é o clique.
 */
export function useCreateTriageTask(publicacao: PublicationWithRelations) {
  const { user } = useAuth()
  const invalidatePublications = useInvalidatePublications()
  const invalidateTasks = useInvalidateTaskSurfaces()

  return useMutation({
    mutationFn: async (dueDate: string | null) => {
      const triage = publicacao.triage
      if (!triage?.suggested_task || !user) throw new Error('Sem sugestão de tarefa.')
      const task = await createTask(
        {
          title: triage.suggested_task,
          description: `Publicação #${publicacao.sequence_number}: ${triage.summary}`,
          priority: PRIORITY_BY_URGENCY[triage.urgency],
          due_date: dueDate,
          legal_process_id: publicacao.legal_process_id ?? null,
          publication_id: publicacao.id,
        },
        user.id,
      )
      await updateTriageSuggestion(publicacao.id, {
        suggestion_status: 'task_created',
        task_id: task.id,
      })
      return task
    },
    onSuccess: () => {
      invalidatePublications()
      invalidateTasks()
      toast.success('Tarefa criada.')
    },
    onError: () => toast.error('Não foi possível criar a tarefa.'),
  })
}

export function useDismissTriageSuggestion(publicationId: string) {
  const invalidate = useInvalidatePublications()
  return useMutation({
    mutationFn: () => updateTriageSuggestion(publicationId, { suggestion_status: 'dismissed' }),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Não foi possível descartar a sugestão.'),
  })
}

/** O processo provável da triagem vira o processo da publicação. */
export function useLinkProbableProcess(publicationId: string) {
  const invalidatePublications = useInvalidatePublications()
  const invalidateProcesses = useInvalidateLegalProcesses()
  return useMutation({
    mutationFn: (legalProcessId: string) => linkPublicationToProcess(publicationId, legalProcessId),
    onSuccess: () => {
      invalidatePublications()
      invalidateProcesses()
      toast.success('Publicação vinculada ao processo.')
    },
    onError: () => toast.error('Não foi possível vincular a publicação.'),
  })
}
