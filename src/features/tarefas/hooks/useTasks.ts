'use client'

import { useQuery } from '@tanstack/react-query'
import { getTasks, getTaskComments, getTasksForEntity } from '../services/tasks.service'

/** Every key sits under the ['tasks'] prefix. `comments` used to be
 * ['task-comments', id] — outside the prefix, which meant the task invalidation
 * helpers silently missed it. */
export const taskKeys = {
  all: ['tasks'] as const,
  comments: (taskId: string) => ['tasks', 'comments', taskId] as const,
  /** Tasks of a processo, including those reached through its crm_items.
   * Ids are sorted by the caller so the key stays stable across fetches. */
  forEntity: (legalProcessId: string | null, crmItemIds: string[]) =>
    ['tasks', 'entity', legalProcessId ?? '-', crmItemIds.join(',')] as const,
}

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.all,
    queryFn: getTasks,
  })
}

/** Tasks of a caso or processo, for the Tarefas tab inside the modals. */
export function useTasksForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
}) {
  const legalProcessId = params.legalProcessId ?? null
  const crmItemIds = [...(params.crmItemIds ?? [])].sort()

  return useQuery({
    queryKey: taskKeys.forEntity(legalProcessId, crmItemIds),
    queryFn: () => getTasksForEntity({ legalProcessId, crmItemIds }),
    enabled: !!legalProcessId || crmItemIds.length > 0,
  })
}

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: () => getTaskComments(taskId),
    enabled: !!taskId,
  })
}
