import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_FILES_BUCKET, buildAiFilePath } from './constants'

/**
 * Leitura de arquivos no servidor, sempre com o client de QUEM PERGUNTA — a
 * RLS de `ai_files`/`documents` e as policies dos buckets decidem o que sai.
 * Nada aqui usa service role.
 */

export interface AiFileRow {
  id: string
  conversation_id: string
  origin: 'upload' | 'generated'
  storage_path: string
  file_name: string
  media_type: string
  size_bytes: number
  extracted_text: string | null
}

export const AI_FILE_SELECT =
  'id, conversation_id, origin, storage_path, file_name, media_type, size_bytes, extracted_text'

export async function getAiFile(supabase: SupabaseClient, id: string): Promise<AiFileRow | null> {
  const { data, error } = await supabase
    .from('ai_files')
    .select(AI_FILE_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as AiFileRow | null) ?? null
}

/**
 * Guarda um arquivo gerado pela IA na conversa: objeto em `ai-files` (pasta do
 * dono) + linha em `ai_files` com origem 'generated'. Se a linha falhar, o
 * objeto sai junto — arquivo sem linha ninguém acharia para apagar.
 */
export async function saveGeneratedFile(
  supabase: SupabaseClient,
  {
    userId,
    conversationId,
    fileName,
    mediaType,
    bytes,
  }: {
    userId: string
    conversationId: string
    fileName: string
    mediaType: string
    bytes: Uint8Array
  },
): Promise<{ id: string }> {
  const path = buildAiFilePath(userId, conversationId, fileName)
  const storage = supabase.storage.from(AI_FILES_BUCKET)

  const { error: uploadError } = await storage.upload(path, bytes, { contentType: mediaType })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('ai_files')
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      origin: 'generated',
      storage_path: path,
      file_name: fileName,
      media_type: mediaType,
      size_bytes: bytes.byteLength,
    })
    .select('id')
    .single()

  if (error || !data) {
    const { error: removeError } = await storage.remove([path])
    if (removeError) console.error('[ia] remoção de arquivo gerado falhou:', path, removeError.message)
    throw error ?? new Error('Registro do arquivo gerado não voltou.')
  }
  return { id: data.id as string }
}

export async function downloadBytes(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}
