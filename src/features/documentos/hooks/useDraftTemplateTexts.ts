'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  draftTemplateTexts,
  type DraftTemplateTextsInput,
} from '../services/templateDrafting.service'

/** "Redigir com IA" da tela de geração. O texto volta para o formulário —
 * nada é gravado — e quem gera revisa antes de baixar. */
export function useDraftTemplateTexts() {
  return useMutation({
    mutationFn: (input: DraftTemplateTextsInput) => draftTemplateTexts(input),
    onError: (error) => {
      const message = error instanceof Error && error.message ? error.message : null
      toast.error(message ?? 'A IA não conseguiu redigir.')
    },
  })
}
