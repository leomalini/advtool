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
import { useAuth } from '@/hooks/useAuth'
import type { CreateTaskInput, UpdateTaskInput } from '@/schemas/task.schema'

export function useCreateTask() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
      toast.success('Tarefa criada!')
    },
    onError: () => toast.error('Erro ao criar tarefa.'),
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
    onError: () => toast.error('Erro ao atualizar tarefa.'),
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
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
