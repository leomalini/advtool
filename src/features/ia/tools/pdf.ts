import { tool } from 'ai'
import { z } from 'zod'
import { AI_FILE_TYPES } from '../files/constants'
import { saveGeneratedFile } from '../files/storage'
import { markdownToPdf } from '../pdf/markdownToPdf'
import type { ToolClient } from './shared'

export interface PdfToolsContext {
  userId: string
  conversationId: string
}

export function createPdfTools(supabase: ToolClient, context: PdfToolsContext) {
  return {
    gerar_pdf: tool({
      description:
        'Gera um PDF a partir de conteúdo em Markdown (títulos, parágrafos, listas, tabelas, ' +
        'negrito) — relatórios, resumos, listas de prazos, minutas livres. O arquivo fica na ' +
        'conversa para o usuário baixar. Para petição no formato de um modelo do escritório, use ' +
        'gerar_documento_de_modelo.',
      inputSchema: z.object({
        titulo: z.string().min(1).max(200).describe('Título no topo do documento.'),
        conteudo_markdown: z.string().min(1).max(100_000),
        nome_arquivo: z.string().max(120).optional().describe('Sem extensão. Padrão: o título.'),
      }),
      execute: async ({ titulo, conteudo_markdown, nome_arquivo }) => {
        try {
          const bytes = await markdownToPdf({ title: titulo, markdown: conteudo_markdown })
          const base = (nome_arquivo?.trim() || titulo).replace(/[\\/:*?"<>|]/g, ' ').trim()
          const fileName = `${base || 'documento'}.pdf`

          const saved = await saveGeneratedFile(supabase, {
            userId: context.userId,
            conversationId: context.conversationId,
            fileName,
            mediaType: AI_FILE_TYPES.pdf.mediaType,
            bytes,
          })
          return { arquivo_id: saved.id, nome: fileName }
        } catch (error) {
          console.error('[ia] tool gerar_pdf falhou:', error)
          return { error: 'Não foi possível gerar o PDF.' }
        }
      },
    }),
  }
}
