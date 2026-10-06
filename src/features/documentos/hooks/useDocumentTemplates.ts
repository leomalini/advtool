'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import {
  createTemplate,
  deleteTemplate,
  getTemplates,
  updateTemplate,
  type TemplateFormInput,
} from '../services/templates.service'

export const templateKeys = {
  all: ['document_templates'] as const,
}

export function useDocumentTemplates() {
  return useQuery({
    queryKey: templateKeys.all,
    queryFn: getTemplates,
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: TemplateFormInput & { file: File }) => {
      if (!user) throw new Error('Sessão expirada. Entre de novo.')
      return createTemplate(input, user.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
      toast.success('Modelo salvo!')
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao salvar o modelo.')),
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      template,
      input,
    }: {
      template: Pick<DocumentTemplate, 'id' | 'file_path' | 'fields'>
      input: TemplateFormInput & { file: File | null }
    }) => updateTemplate(template, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
      toast.success('Modelo atualizado!')
    },
    onError: (error) => toast.error(errorMessage(error, 'Erro ao atualizar o modelo.')),
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
