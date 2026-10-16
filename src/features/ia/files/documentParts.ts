import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilePart, TextPart } from 'ai'
import { aiFileTypeFromName, isReadAsFile } from './constants'
import { extractText } from './extractText'
import { downloadBytes } from './storage'

/**
 * Documentos cadastrados (`documents`) como o modelo os lê — SÓ SERVIDOR (lê
 * Word e Excel com `mammoth`/`exceljs`). PDF e imagem vão no original; o
 * resto, como texto. O que não dá para ler vira aviso, não erro.
 *
 * Usado pela redação com IA dos modelos e pelo leitor de documentos dos
 * contratos.
 */

const DOCUMENTS_BUCKET = 'attachments'

/** Texto por documento. Um contrato inteiro cabe; uma planilha enorme, não. */
const MAX_DOCUMENT_CHARS = 60_000

/** PDF/imagem acima disto fica de fora — o pedido inteiro tem teto no provedor. */
export const MAX_DOCUMENT_FILE_BYTES = 20 * 1024 * 1024

export interface ReadableDocument {
  id: string
  file_name: string
  file_path: string
  file_size: number
  /** Bucket do arquivo. Padrão: `attachments` (Documentos); anexos do chat
   * ficam em `ai-files`. */
  bucket?: string
  /** Texto já extraído na subida (Word/Excel anexado no chat). */
  extracted_text?: string | null
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export async function readDocumentsAsParts(
  supabase: SupabaseClient,
  documents: readonly ReadableDocument[],
  /** O cabeçalho de cada documento na mensagem — é por ele que o modelo o
   * cita de volta. */
  label: (document: ReadableDocument) => string,
): Promise<{ parts: Array<TextPart | FilePart>; skipped: string[]; read: ReadableDocument[] }> {
  const parts: Array<TextPart | FilePart> = []
  const skipped: string[] = []
  const read: ReadableDocument[] = []

  for (const document of documents) {
    const type = aiFileTypeFromName(document.file_name)
    if (!type) {
      skipped.push(`${document.file_name} (formato que a IA não lê)`)
      continue
    }
    if (isReadAsFile(type.kind) && document.file_size > MAX_DOCUMENT_FILE_BYTES) {
      skipped.push(`${document.file_name} (grande demais)`)
      continue
    }
    try {
      const bucket = document.bucket ?? DOCUMENTS_BUCKET
      if (!isReadAsFile(type.kind) && document.extracted_text) {
        parts.push({
          type: 'text',
          text: `${label(document)}\n\n${clip(document.extracted_text, MAX_DOCUMENT_CHARS)}`,
        })
        read.push(document)
        continue
      }
      const bytes = await downloadBytes(supabase, bucket, document.file_path)
      if (isReadAsFile(type.kind)) {
        parts.push({ type: 'text', text: label(document) })
        parts.push({
          type: 'file',
          data: { type: 'data', data: bytes },
          mediaType: type.mediaType,
          filename: document.file_name,
        })
      } else {
        const text = await extractText(type.kind, bytes)
        parts.push({
          type: 'text',
          text: `${label(document)}\n\n${clip(text ?? '', MAX_DOCUMENT_CHARS) || '[sem texto]'}`,
        })
      }
      read.push(document)
    } catch (readError) {
      console.error('[ia] leitura de documento para a IA falhou:', document.id, readError)
      skipped.push(`${document.file_name} (não foi possível ler)`)
    }
  }

  return { parts, skipped, read }
}
