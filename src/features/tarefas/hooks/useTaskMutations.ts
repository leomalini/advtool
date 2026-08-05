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
      await queryClient.cancelQueries({ queryKey: taskKeys.all })
      const previous = queryClient.getQueryData<Task[]>(taskKeys.all)

      // Exact key, not prefix: setQueryData matches exactly, so this only
      // touches the board's list — entity tabs refetch via invalidate below.
      queryClient.setQueryData<Task[]>(
        taskKeys.all,
        (old) => old?.map((t) => (t.id === id ? { ...t, status, position } : t)) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.all, context.previous)
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
