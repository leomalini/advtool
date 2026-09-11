'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createTask,
  updateTask,
  deleteTask,
  addTaskComment,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  type TaskWriteOptions,
} from '../services/tasks.service'
import { taskKeys } from './useTasks'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { useAuth } from '@/hooks/useAuth'
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema'
import type { Task, TaskStatus } from '@/types/task.types'

/** Every surface that shows task-derived data — see useInvalidateEventSurfaces
 * for why the dashboard keys have to be listed explicitly. */
export function useInvalidateTaskSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefix — reaches comments() and forEntity() too.
    queryClient.invalidateQueries({ queryKey: taskKeys.all })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.stats })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
    // Uma tarefa vinculada "cobre" um prazo próximo; concluí-la volta a
    // descobrir o prazo. Nos dois sentidos a pendência precisa recalcular.
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.pendencies })
  }
}

export function useCreateTask() {
  const invalidate = useInvalidateTaskSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Tarefa criada!')
    },
    onError: () => toast.error('Erro ao criar tarefa.'),
  })
}

export function useUpdateTask() {
  const invalidate = useInvalidateTaskSurfaces()
  const { user } = useAuth()

  return useMutation({
    // userId enables the task_done activity on the ≠done → done transition.
    // `options` só vem do detalhe, quando a tarefa é de uma série.
    mutationFn: ({ options, ...input }: UpdateTaskInput & { options?: TaskWriteOptions }) =>
      updateTask(input, user?.id, options),
    onSuccess: () => {
      invalidate()
    },
    onError: () => toast.error('Erro ao atualizar tarefa.'),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTaskSurfaces()

  return useMutation({
    // Id sozinho para a tarefa avulsa; com `options` quando é de uma série.
    mutationFn: (target: string | { id: string; options?: TaskWriteOptions }) =>
      typeof target === 'string' ? deleteTask(target) : deleteTask(target.id, target.options),
    onSuccess: () => {
      invalidate()
      toast.success('Tarefa removida.')
    },
    onError: () => toast.error('Erro ao remover tarefa.'),
  })
}

export function useAddTaskComment(taskId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (content: string) => addTaskComment(taskId, content, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) })
    },
    onError: () => toast.error('Erro ao adicionar comentário.'),
  })
}

/**
 * Toda lista de tarefas em cache — o board (`['tasks']`), as abas de detalhe
 * (`['tasks','entity',…]`) e a Agenda (`['tasks','range',…]`). Sem incluir as
 * abas, o card arrastado dentro de um processo ou cliente voltava para a coluna
 * de origem até o refetch chegar, dando a impressão de que o movimento falhou.
 * `['tasks','comments',…]` fica de fora de propósito: guarda comentários, e um
 * update cego por prefixo corromperia esse cache.
 */
const TASK_LIST_FILTERS = [
  { queryKey: taskKeys.all, exact: true },
  { queryKey: ['tasks', 'entity'] as const },
  { queryKey: ['tasks', 'range'] as const },
]

/** Aplica `patch` à tarefa `id` em todas as listas em cache e devolve o
 * retrato anterior, para desfazer se o servidor recusar. */
async function patchCachedTask(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<Task>
) {
  // Prefixo: cancela o board, as abas e a Agenda de uma vez.
  await queryClient.cancelQueries({ queryKey: taskKeys.all })

  const snapshots = TASK_LIST_FILTERS.flatMap((f) => queryClient.getQueriesData<Task[]>(f))
  const apply = (old: Task[] | undefined) =>
    old?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? []

  for (const f of TASK_LIST_FILTERS) queryClient.setQueriesData<Task[]>(f, apply)

  return { snapshots }
}

/**
 * Optimistic status move for the kanban — the card lands in the new column
 * immediately instead of waiting for the round trip and snapping back.
 * Mirrors useOptimisticMoveCrmItem in the CRM board.
 */
export function useOptimisticMoveTask() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateTaskSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ id, status, position }: { id: string; status: TaskStatus; position: number }) =>
      updateTask({ id, status, position }, user?.id),
    onMutate: ({ id, status, position }) => patchCachedTask(queryClient, id, { status, position }),
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error('Erro ao mover tarefa.')
    },
    onSettled: () => invalidate(),
  })
}

/**
 * Marca/desmarca a tarefa como concluída direto da Agenda — o círculo do
 * Google Agenda. Otimista: o item risca na hora, sem esperar a volta.
 * Desmarcar devolve para "A Fazer", que é de onde uma tarefa reaberta recomeça.
 */
export function useToggleTaskDone() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateTaskSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      updateTask({ id, status: done ? 'done' : 'todo' }, user?.id),
    onMutate: ({ id, done }) =>
      patchCachedTask(queryClient, id, { status: done ? 'done' : 'todo' }),
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error('Erro ao atualizar tarefa.')
    },
    onSettled: () => invalidate(),
  })
}

export function useAddChecklistItem(taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (title: string) => addChecklistItem(taskId, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
    onError: () => toast.error('Erro ao adicionar item.'),
  })
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      toggleChecklistItem(id, isDone),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteChecklistItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}
