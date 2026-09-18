import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import {
  AI_FILES_BUCKET,
  AI_FILE_MAX_BYTES,
  aiFileTypeFromName,
  buildAiFilePath,
} from '../files/constants'

const supabase = createClient()

/** Erro com mensagem pronta para o toast. */
export class AiFileError extends Error {}

const registeredSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  mediaType: z.string(),
  size: z.number(),
})

export type RegisteredAiFile = z.infer<typeof registeredSchema>

/**
 * Sobe um anexo da conversa e o registra.
 *
 * Dois passos porque o arquivo não pode passar por uma função da Vercel (corpo
 * limitado): o navegador sobe direto para o bucket — na pasta do próprio
 * usuário, que é o que a policy aceita — e a rota `/api/ia/files` confere,
 * extrai o texto e cria a linha. Se o registro recusar, a própria rota apaga o
 * objeto.
 */
export async function uploadAiFile({
  file,
  userId,
  conversationId,
}: {
  file: File
  userId: string
  conversationId: string
}): Promise<RegisteredAiFile> {
  const type = aiFileTypeFromName(file.name)
  if (!type) throw new AiFileError(`Formato não suportado: ${file.name}`)
  if (file.size > AI_FILE_MAX_BYTES) throw new AiFileError(`${file.name} passa de 25 MB.`)

  const path = buildAiFilePath(userId, conversationId, file.name)
  const { error: uploadError } = await supabase.storage
    .from(AI_FILES_BUCKET)
    // O MIME vem da extensão (ver `constants.ts`), não do `file.type`.
    .upload(path, file, { contentType: type.mediaType })
  if (uploadError) {
    console.error('[ia] upload de anexo falhou:', uploadError.message)
    throw new AiFileError(`Não foi possível enviar ${file.name}.`)
  }

  const response = await fetch('/api/ia/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, storagePath: path, fileName: file.name }),
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(body)
    throw new AiFileError(message.success ? message.data.error : `Não foi possível registrar ${file.name}.`)
  }

  const registered = registeredSchema.safeParse(body)
  if (!registered.success) throw new AiFileError(`Resposta inesperada ao registrar ${file.name}.`)
  return registered.data
}

/** O arquivo como `File`, para entregar ao `uploadDocument` de Documentos. */
export async function downloadAiFileAsFile(id: string): Promise<File> {
  const { data: row, error } = await supabase
    .from('ai_files')
    .select('storage_path, file_name, media_type')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new AiFileError('Arquivo não encontrado.')

  const { data: blob, error: downloadError } = await supabase.storage
    .from(AI_FILES_BUCKET)
    .download(row.storage_path as string)
  if (downloadError) throw downloadError

  return new File([blob], row.file_name as string, { type: row.media_type as string })
}

/**
 * Apaga do bucket os arquivos de uma conversa. As linhas de `ai_files` somem
 * em cascata com a conversa; os objetos não — sem isto ficariam no bucket sem
 * nada apontando para eles.
 */
export async function removeConversationFiles(conversationId: string): Promise<void> {
  const { data, error } = await supabase
    .from('ai_files')
    .select('storage_path')
    .eq('conversation_id', conversationId)
  if (error) throw error

  const paths = (data ?? []).map((row) => row.storage_path as string)
  if (paths.length === 0) return

  const { error: removeError } = await supabase.storage.from(AI_FILES_BUCKET).remove(paths)
  if (removeError) throw removeError
}
