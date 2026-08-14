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
    mutationFn: (input: UpdateTaskInput) => updateTask(input, user?.id),
    onSuccess: () => {
      invalidate()
    },
    onError: () => toast.error('Erro ao atualizar tarefa.'),
  })
}

export function useDeleteTask() {
  const invalidate = useInvalidateTaskSurfaces()

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
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
    onMutate: async ({ id, status, position }) => {
      // Prefixo: cancela o board e as abas de detalhe de uma vez.
      await queryClient.cancelQueries({ queryKey: taskKeys.all })

      // Toda lista de tarefas em cache — o board (`['tasks']`) e as abas de
      // detalhe (`['tasks','entity',…]`). Sem incluir as abas, o card arrastado
      // dentro de um processo ou cliente voltava para a coluna de origem até o
      // refetch chegar, dando a impressão de que o movimento falhou.
      // `['tasks','comments',…]` fica de fora de propósito: guarda comentários,
      // e um update cego por prefixo corromperia esse cache.
      const filters = [
        { queryKey: taskKeys.all, exact: true },
        { queryKey: ['tasks', 'entity'] as const },
      ]

      const snapshots = filters.flatMap((f) => queryClient.getQueriesData<Task[]>(f))

      const apply = (old: Task[] | undefined) =>
        old?.map((t) => (t.id === id ? { ...t, status, position } : t)) ?? []

      for (const f of filters) queryClient.setQueriesData<Task[]>(f, apply)

      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error('Erro ao mover tarefa.')
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
