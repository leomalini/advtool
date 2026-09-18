import { tool } from 'ai'
import { z } from 'zod'
import { documentCategorySchema } from '@/schemas/document.schema'
import { DOCUMENT_CATEGORY_LABELS, formatFileSize } from '@/types/document.types'
import type { DocumentCategory } from '@/types/document.types'
import {
  AI_FILES_BUCKET,
  aiFileKindFromMediaType,
  aiFileTypeFromName,
  isReadAsFile,
  type AiFileKind,
} from '../../files/constants'
import { extractText } from '../../files/extractText'
import { downloadBytes, getAiFile } from '../../files/storage'
import { clientLabel, limitSchema, toolError, type ToolClient } from '../shared'

const DOCUMENTS_BUCKET = 'attachments'

export interface FileToolsContext {
  /** Chamadas de tool de turnos anteriores (ver `toModelOutput` abaixo). */
  historicalToolCallIds: ReadonlySet<string>
}

type ArquivoLido =
  | { error: string }
  | {
      id: string
      origem: 'conversa' | 'documentos'
      nome: string
      tipo: string
      tamanho: string
    }

interface ResolvedFile {
  name: string
  mediaType: string
  kind: AiFileKind
  bucket: string
  path: string
  /** Texto já extraído (anexo de Word/Excel da conversa). */
  extractedText: string | null
}

/** O mesmo arquivo, visto por quem pergunta — RLS decide. */
async function resolveFile(
  supabase: ToolClient,
  origem: 'conversa' | 'documentos',
  id: string,
): Promise<ResolvedFile | { error: string }> {
  if (origem === 'conversa') {
    const row = await getAiFile(supabase, id)
    if (!row) return { error: 'Anexo não encontrado nesta conta.' }
    const kind = aiFileKindFromMediaType(row.media_type)
    if (!kind) return { error: `Formato não suportado para leitura (${row.media_type}).` }
    return {
      name: row.file_name,
      mediaType: row.media_type,
      kind,
      bucket: AI_FILES_BUCKET,
      path: row.storage_path,
      extractedText: row.extracted_text,
    }
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name, file_path')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { error: 'Documento não encontrado ou sem acesso.' }

  // `documents.file_type` vem do navegador e às vezes é genérico
  // (application/octet-stream); a extensão é mais confiável.
  const type = aiFileTypeFromName(data.file_name as string)
  if (!type) return { error: `Formato não suportado para leitura: ${data.file_name}.` }
  return {
    name: data.file_name as string,
    mediaType: type.mediaType,
    kind: type.kind,
    bucket: DOCUMENTS_BUCKET,
    path: data.file_path as string,
    extractedText: null,
  }
}

export function createFileTools(supabase: ToolClient, context: FileToolsContext) {
  return {
    listar_documentos: tool({
      description:
        'Documentos cadastrados no módulo Documentos do AdvTool (petições, contratos, ' +
        'procurações, decisões…), filtráveis por cliente, processo, categoria ou nome do ' +
        'arquivo. Use para achar o id antes de ler_arquivo com origem "documentos".',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        processo_id: z.string().uuid().optional(),
        categoria: documentCategorySchema.optional(),
        termo: z.string().max(120).optional().describe('Trecho do nome do arquivo.'),
        limite: limitSchema,
      }),
      execute: async ({ cliente_id, processo_id, categoria, termo, limite }) => {
        let query = supabase
          .from('documents')
          .select(
            'id, file_name, category, file_size, created_at, ' +
              'client:clients(type, name, company_name, trade_name), ' +
              'legal_process:legal_processes(cnj_number)',
          )
          .order('created_at', { ascending: false })
          .limit(limite ?? 10)

        if (processo_id) {
          // Mesmo vínculo de `getDocumentsForEntity`: direto no processo ou por
          // um dos cards de CRM dele.
          const { data: cards, error: cardsError } = await supabase
            .from('crm_items')
            .select('id')
            .eq('legal_process_id', processo_id)
          if (cardsError) return toolError('os documentos', cardsError)
          const terms = [`legal_process_id.eq.${processo_id}`]
          const cardIds = (cards ?? []).map((card) => card.id as string)
          if (cardIds.length > 0) terms.push(`crm_item_id.in.(${cardIds.join(',')})`)
          query = query.or(terms.join(','))
        }
        if (cliente_id) query = query.eq('client_id', cliente_id)
        if (categoria) query = query.eq('category', categoria)
        if (termo?.trim()) query = query.ilike('file_name', `%${termo.trim().replace(/[%_]/g, ' ')}%`)

        const { data, error } = await query
        if (error) return toolError('os documentos', error)

        const rows = (data ?? []) as unknown as Array<{
          id: string
          file_name: string
          category: DocumentCategory
          file_size: number
          created_at: string
          client: Parameters<typeof clientLabel>[0]
          legal_process: { cnj_number: string | null } | null
        }>

        return {
          documentos: rows.map((row) => ({
            id: row.id,
            nome: row.file_name,
            categoria: DOCUMENT_CATEGORY_LABELS[row.category] ?? row.category,
            tamanho: formatFileSize(row.file_size),
            enviado_em: row.created_at,
            cliente: clientLabel(row.client),
            processo_cnj: row.legal_process?.cnj_number ?? null,
            // A IA sabe de antemão que não adianta tentar abrir um .doc ou .zip.
            pode_ler: aiFileTypeFromName(row.file_name) !== null,
          })),
        }
      },
    }),

    ler_arquivo: tool({
      description:
        'Abre um arquivo para leitura: um anexo desta conversa (origem "conversa", id do ' +
        'anexo) ou um documento cadastrado (origem "documentos", id de listar_documentos). ' +
        'PDF e imagem chegam no original; Word, Excel, CSV e TXT como texto. Use quando o ' +
        'conteúdo não estiver na mensagem atual.',
      inputSchema: z.object({
        origem: z.enum(['conversa', 'documentos']),
        id: z.string().uuid(),
      }),
      // Só metadados: é isto que fica gravado na conversa. O conteúdo em si
      // entra por `toModelOutput`, que roda a cada vez que o histórico vai ao
      // modelo — e nunca é gravado.
      execute: async ({ origem, id }): Promise<ArquivoLido> => {
        try {
          const file = await resolveFile(supabase, origem, id)
          if ('error' in file) return file
          const { data } = await supabase.storage.from(file.bucket).info(file.path)
          return {
            id,
            origem,
            nome: file.name,
            tipo: file.mediaType,
            tamanho: data?.size != null ? formatFileSize(data.size) : '—',
          }
        } catch (error) {
          console.error('[ia] tool ler_arquivo falhou:', error)
          return { error: 'Não foi possível abrir o arquivo.' }
        }
      },
      toModelOutput: async ({ toolCallId, output }) => {
        if ('error' in output) return { type: 'error-text', value: output.error }

        const header = `Arquivo "${output.nome}" (${output.origem}, id ${output.id}).`

        // Leitura de um turno anterior: o conteúdo já cumpriu o papel dele.
        // Reenviar um PDF a cada pergunta encareceria todo turno seguinte.
        if (context.historicalToolCallIds.has(toolCallId)) {
          return {
            type: 'text',
            value: `${header} Lido num turno anterior — chame ler_arquivo de novo se precisar do conteúdo.`,
          }
        }

        try {
          const file = await resolveFile(supabase, output.origem, output.id)
          if ('error' in file) return { type: 'error-text', value: file.error }

          if (isReadAsFile(file.kind)) {
            const data = await downloadBytes(supabase, file.bucket, file.path)
            return {
              type: 'content',
              value: [
                { type: 'text', text: header },
                { type: 'file', data: { type: 'data', data }, mediaType: file.mediaType, filename: file.name },
              ],
            }
          }

          const text =
            file.extractedText ??
            (await extractText(file.kind, await downloadBytes(supabase, file.bucket, file.path)))
          return { type: 'text', value: `${header}\n\n${text ?? '[arquivo sem texto extraível]'}` }
        } catch (error) {
          console.error('[ia] conteúdo de ler_arquivo falhou:', error)
          return { type: 'error-text', value: 'Não foi possível ler o conteúdo do arquivo.' }
        }
      },
    }),
  }
}
