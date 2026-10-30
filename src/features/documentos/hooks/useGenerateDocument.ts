'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { contractKeys } from '@/features/contratos/hooks/useContracts'
import {
  setContractTemplate,
  uploadContractFile,
} from '@/features/contratos/services/contracts.service'
import { saveContractTemplateValues } from '@/features/contratos/services/contractParties.service'
import type { ContractTemplateValues } from '@/types/contract.types'
import { AI_FILE_TYPES } from '@/features/ia/files/constants'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { downloadBlob } from '@/utils/download'
import { uploadDocument } from '../services/documents.service'
import { downloadTemplateBytes } from '../services/templates.service'
import type { CatalogFieldName } from '../templates/catalog'
import { getProcessClientId, resolveTemplateFields } from '../templates/resolveFields'
import type { TemplateValues } from '../templates/values'
import { documentKeys } from './useDocuments'

const supabase = createClient()

/**
 * O .docx do modelo, baixado uma vez e reaproveitado pela prévia e pelo
 * download. A chave é o caminho: trocar o arquivo do modelo muda o caminho, e
 * com ele a chave — o cache nunca serve um arquivo antigo.
 */
export function templateBytesQuery(filePath: string) {
  return queryOptions({
    queryKey: ['template-generation', 'bytes', filePath],
    queryFn: () => downloadTemplateBytes(filePath),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
}

export function useTemplateBytes(filePath: string | null) {
  return useQuery({ ...templateBytesQuery(filePath ?? ''), enabled: !!filePath })
}

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
  contractId = null,
  lawyerIds,
}: {
  templateId: string | null
  fields: readonly CatalogFieldName[]
  clientId: string | null
  processId: string | null
  /** Fonte dos campos `{contrato_*}`. */
  contractId?: string | null
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
      contractId ?? '-',
      lawyerIds.join(','),
    ],
    queryFn: () =>
      resolveTemplateFields(supabase, {
        fields,
        clientId,
        processId,
        contractId,
        lawyerIds,
        now: new Date(),
      }),
    enabled: !!templateId && fields.length > 0,
  })
}

/** Onde guardar uma cópia do gerado: nos documentos do cliente/processo, ou
 * como minuta de um contrato (migration 69). */
export type GenerateSaveTarget =
  | { kind: 'entity'; clientId: string | null; processId: string | null }
  | {
      kind: 'contract'
      contractId: string
      /** O que foi preenchido — "Gerar nova versão" reabre com isto. */
      templateValues: ContractTemplateValues
    }

interface GenerateInput {
  template: Pick<DocumentTemplate, 'id' | 'file_path' | 'category'>
  values: TemplateValues
  fileName: string
  /** null = só baixar. */
  saveTo: GenerateSaveTarget | null
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
        queryClient.fetchQuery(templateBytesQuery(template.file_path)),
      ])
      // Cópia: os bytes do cache servem também à prévia.
      const rendered = renderTemplate(source.slice(), values)
      const file = new File([rendered.bytes as BlobPart], fileName, {
        type: AI_FILE_TYPES.docx.mediaType,
      })
      downloadBlob(file, fileName)

      if (saveTo) {
        if (!user) throw new Error('Sessão expirada. Entre de novo para salvar.')
        if (saveTo.kind === 'contract') {
          await uploadContractFile(saveTo.contractId, 'minuta', file, user.id, 'modelo')
          // Só lembram o modelo e o preenchido para a próxima versão: falhar
          // aqui não desfaz a minuta, que já está salva.
          await Promise.all([
            setContractTemplate(saveTo.contractId, template.id),
            saveContractTemplateValues(saveTo.contractId, saveTo.templateValues),
          ]).catch((error: unknown) =>
            console.error('[contratos] modelo/valores da minuta não gravados:', error),
          )
        } else {
          await uploadDocument(
            {
              category: template.category,
              client_id: saveTo.clientId,
              legal_process_id: saveTo.processId,
              crm_item_id: null,
              event_id: null,
              origin: 'modelo',
            },
            file,
            user.id,
          )
        }
      }
      return { missing: rendered.missing, savedTo: saveTo?.kind ?? null }
    },
    onSuccess: ({ savedTo }) => {
      if (savedTo) {
        queryClient.invalidateQueries({ queryKey: documentKeys.all })
        queryClient.invalidateQueries({ queryKey: contractKeys.all })
        toast.success(
          savedTo === 'contract'
            ? 'Minuta gerada e salva no contrato.'
            : 'Documento gerado e salvo em Documentos.',
        )
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
