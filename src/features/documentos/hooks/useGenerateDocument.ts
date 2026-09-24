'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { AI_FILE_TYPES } from '@/features/ia/files/constants'
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboardStats'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { downloadBlob } from '@/utils/download'
import { uploadDocument } from '../services/documents.service'
import { downloadTemplateBytes } from '../services/templates.service'
import type { CatalogFieldName } from '../templates/catalog'
import { getProcessClientId, resolveTemplateFields } from '../templates/resolveFields'
import type { TemplateValues } from '../templates/values'
import { documentKeys } from './useDocuments'

const supabase = createClient()

/** Cliente de um processo (dono do card mestre ou única parte vinculada). */
export function useProcessClientId(processId: string | null | undefined) {
  return useQuery({
    queryKey: ['template-generation', 'process-client', processId ?? '-'],
    queryFn: () => getProcessClientId(supabase, processId as string),
    enabled: !!processId,
  })
}

/**
 * Valores de cadastro de um modelo, lidos com o client do navegador — a mesma
 * RLS da tela. A chave inclui tudo que muda a resposta, inclusive os campos:
 * aberta com o modelo já escolhido, a tela pede antes de a lista de modelos
 * chegar, e uma resposta sem campos não pode ficar no cache no lugar da
 * certa. `now` fica fora de propósito: a data de hoje não vale uma nova
 * consulta a cada render.
 */
export function useTemplateFieldValues({
  templateId,
  fields,
  clientId,
  processId,
  lawyerIds,
}: {
  templateId: string | null
  fields: readonly CatalogFieldName[]
  clientId: string | null
  processId: string | null
  lawyerIds: readonly string[]
}) {
  return useQuery({
    queryKey: [
      'template-generation',
      'values',
      templateId ?? '-',
      fields.join(','),
      clientId ?? '-',
      processId ?? '-',
      lawyerIds.join(','),
    ],
    queryFn: () =>
      resolveTemplateFields(supabase, {
        fields,
        clientId,
        processId,
        lawyerIds,
        now: new Date(),
      }),
    enabled: !!templateId && fields.length > 0,
  })
}

interface GenerateInput {
  template: Pick<DocumentTemplate, 'file_path' | 'category'>
  values: TemplateValues
  fileName: string
  /** Onde guardar uma cópia em Documentos; null = só baixar. */
  saveTo: { clientId: string | null; processId: string | null } | null
}

/**
 * Preenche o modelo no navegador e entrega o .docx. O `docxtemplater` é
 * importado aqui, sob demanda: quem só abre a página do cliente não paga o
 * download da biblioteca.
 */
export function useGenerateDocument() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ template, values, fileName, saveTo }: GenerateInput) => {
      const [{ renderTemplate }, source] = await Promise.all([
        import('../templates/docx'),
        downloadTemplateBytes(template.file_path),
      ])
      const rendered = renderTemplate(source, values)
      const file = new File([rendered.bytes as BlobPart], fileName, {
        type: AI_FILE_TYPES.docx.mediaType,
      })
      downloadBlob(file, fileName)

      if (saveTo) {
        if (!user) throw new Error('Sessão expirada. Entre de novo para salvar.')
        await uploadDocument(
          {
            category: template.category,
            client_id: saveTo.clientId,
            legal_process_id: saveTo.processId,
            crm_item_id: null,
            event_id: null,
          },
          file,
          user.id,
        )
      }
      return { missing: rendered.missing, saved: saveTo !== null }
    },
    onSuccess: ({ saved }) => {
      if (saved) {
        queryClient.invalidateQueries({ queryKey: documentKeys.all })
        queryClient.invalidateQueries({ queryKey: dashboardKeys.activities })
        toast.success('Documento gerado e salvo em Documentos.')
      } else {
        toast.success('Documento gerado.')
      }
    },
    onError: (error) => {
      const message = error instanceof Error && error.message ? error.message : null
      toast.error(message ?? 'Não foi possível gerar o documento.')
    },
  })
}
