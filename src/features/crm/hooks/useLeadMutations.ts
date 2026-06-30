'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createLead, updateLead, deleteLead, moveLead, addLeadComment, deleteLeadComment } from '../services/leads.service'
import { leadKeys } from './useLeads'
import { useAuth } from '@/hooks/useAuth'
import type { CreateLeadInput, UpdateLeadInput, MoveLeadInput, LeadCommentInput } from '@/schemas/lead.schema'

export function useCreateLead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: CreateLeadInput) => createLead(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all })
      toast.success('Lead criado com sucesso!')
    },
    onError: () => toast.error('Erro ao criar lead.'),
  })
}

export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateLeadInput) => updateLead(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all })
      toast.success('Lead atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar lead.'),
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all })
      toast.success('Lead removido.')
    },
    onError: () => toast.error('Erro ao remover lead.'),
  })
}

export function useMoveLead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: MoveLeadInput) => moveLead(input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all })
    },
    onError: () => toast.error('Erro ao mover lead.'),
  })
}

export function useAddLeadComment(leadId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: LeadCommentInput) => addLeadComment(leadId, input, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.comments(leadId) })
    },
    onError: () => toast.error('Erro ao adicionar comentário.'),
  })
}

export function useDeleteLeadComment(leadId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteLeadComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.comments(leadId) })
    },
    onError: () => toast.error('Erro ao remover comentário.'),
  })
}
