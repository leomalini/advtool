'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadDocument, deleteDocument, getDocumentUrl } from '../services/documents.service'
import { documentKeys } from './useDocuments'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import { useAuth } from '@/hooks/useAuth'
import type { DocumentUploadInput } from '@/schemas/document.schema'

/** Toda superfície que mostra documento — mesma forma dos demais invalidadores. */
export function useInvalidateDocumentSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefixo — alcança forEntity também.
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
    queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
  }
}

export function useUploadDocument() {
  const invalidate = useInvalidateDocumentSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ input, file }: { input: DocumentUploadInput; file: File }) =>
      uploadDocument(input, file, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Documento enviado!')
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? `Erro no upload: ${error.message}` : 'Erro ao enviar documento.'
      ),
  })
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocumentSurfaces()

  return useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath: string }) =>
      deleteDocument(id, filePath),
    onSuccess: () => {
      invalidate()
      toast.success('Documento removido.')
    },
    onError: () => toast.error('Erro ao remover documento.'),
  })
}

/** Abre o arquivo numa aba nova via signed URL. Não é uma mutation de dados,
 * mas usa o mesmo padrão de erro/loading dos botões. */
export function useOpenDocument() {
  return useMutation({
    mutationFn: (filePath: string) => getDocumentUrl(filePath),
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: () => toast.error('Não foi possível abrir o arquivo.'),
  })
}
