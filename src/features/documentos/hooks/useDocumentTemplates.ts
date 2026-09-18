'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { createTemplate, deleteTemplate, getTemplates } from '../services/templates.service'

export const templateKeys = {
  all: ['document_templates'] as const,
}

export function useDocumentTemplates() {
  return useQuery({
    queryKey: templateKeys.all,
    queryFn: getTemplates,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: { name: string; description: string; file: File }) =>
      createTemplate(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
      toast.success('Modelo salvo!')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o modelo.'),
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (template: Pick<DocumentTemplate, 'id' | 'file_path'>) => deleteTemplate(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
      toast.success('Modelo removido.')
    },
    onError: () => toast.error('Erro ao remover o modelo.'),
  })
}
