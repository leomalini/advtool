'use client'

import { useQuery } from '@tanstack/react-query'
import { getTasks, getTaskComments } from '../services/tasks.service'

export const taskKeys = {
  all: ['tasks'] as const,
  comments: (taskId: string) => ['task-comments', taskId] as const,
}

export function useTasks() {
  return useQuery({
    queryKey: taskKeys.all,
    queryFn: getTasks,
  })
}

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: () => getTaskComments(taskId),
    enabled: !!taskId,
  })
}
