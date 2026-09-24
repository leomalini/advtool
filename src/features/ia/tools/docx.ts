import { tool } from 'ai'
import { z } from 'zod'
import { AI_FILE_TYPES } from '../files/constants'
import { downloadBytes, saveGeneratedFile } from '../files/storage'
import { LetterheadError, markdownToDocx } from '../docx/markdownToDocx'
import type { ToolClient } from './shared'

const DOCUMENTS_BUCKET = 'attachments'

export interface DocxToolsContext {
  userId: string
  conversationId: string
}

/**
 * Papel timbrado do escritório (Configurações → Geral), se houver. Falha ao
 * ler não impede o documento: ele sai no formato padrão, com aviso.
 */
async function loadLetterhead(
  supabase: ToolClient,
): Promise<{ bytes: Uint8Array | null; warning: string | null }> {
  const { data, error } = await supabase
    .from('office_settings')
    .select('letterhead_path')
    .maybeSingle()
  if (error) {
    console.error('[ia] leitura do papel timbrado falhou:', error.code, error.message)
    return {
      bytes: null,
      warning: 'Não foi possível ler o papel timbrado — saiu no formato padrão.',
    }
  }
  const path = data?.letterhead_path as string | null | undefined
  if (!path) return { bytes: null, warning: null }
  try {
    return { bytes: await downloadBytes(supabase, DOCUMENTS_BUCKET, path), warning: null }
  } catch (downloadError) {
    console.error('[ia] download do papel timbrado falhou:', path, downloadError)
    return {
      bytes: null,
      warning: 'Não foi possível baixar o papel timbrado — saiu no formato padrão.',
    }
  }
}

export function createDocxTools(supabase: ToolClient, context: DocxToolsContext) {
  return {
    gerar_docx: tool({
      description:
        'Gera um documento Word (.docx) a partir de conteúdo em Markdown (títulos, parágrafos, ' +
        'listas, tabelas, negrito, citações com >) — minutas livres, notificações, cartas, ' +
        'pareceres internos. Sai no papel timbrado do escritório quando houver. Prefira a ' +
        'gerar_pdf quando o usuário for editar o texto. Para petição, contrato ou procuração ' +
        'com modelo cadastrado, use gerar_documento_de_modelo.',
      inputSchema: z.object({
        titulo: z.string().max(200).optional().describe('Título centralizado no topo. Opcional.'),
        conteudo_markdown: z.string().min(1).max(100_000),
        nome_arquivo: z.string().max(120).optional().describe('Sem extensão. Padrão: o título.'),
      }),
      execute: async ({ titulo, conteudo_markdown, nome_arquivo }) => {
        try {
          const letterhead = await loadLetterhead(supabase)
          const avisos = letterhead.warning ? [letterhead.warning] : []

          const content = { title: titulo, markdown: conteudo_markdown }
          let bytes: Uint8Array
          try {
            bytes = markdownToDocx({ ...content, letterhead: letterhead.bytes })
          } catch (error) {
            if (!(error instanceof LetterheadError)) throw error
            avisos.push(`${error.message} Saiu no formato padrão.`)
            bytes = markdownToDocx({ ...content, letterhead: null })
          }

          const base = (nome_arquivo?.trim() || titulo?.trim() || 'documento')
            .replace(/[\\/:*?"<>|]/g, ' ')
            .trim()
          const fileName = `${base || 'documento'}.docx`

          const saved = await saveGeneratedFile(supabase, {
            userId: context.userId,
            conversationId: context.conversationId,
            fileName,
            mediaType: AI_FILE_TYPES.docx.mediaType,
            bytes,
          })
          return { arquivo_id: saved.id, nome: fileName, avisos }
        } catch (error) {
          console.error('[ia] tool gerar_docx falhou:', error)
          return { error: 'Não foi possível gerar o documento Word.' }
        }
      },
    }),
  }
}
