import type { Experimental_DownloadFunction } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_FILES_BUCKET, parseAiFileUrl } from './constants'
import { downloadBytes, getAiFile } from './storage'

/**
 * Como o `streamText` busca o conteúdo de um anexo `ai-file://<id>`.
 *
 * Substitui o download padrão do AI SDK, que faria `fetch` de qualquer URL que
 * aparecesse numa mensagem — com mensagens vindas do navegador, isso seria o
 * servidor buscando endereço escolhido pelo cliente. Aqui só existe um caminho:
 * id → linha em `ai_files` (RLS de dono) → bucket `ai-files` (policy de dono).
 */
export function createAiFileDownload(supabase: SupabaseClient): Experimental_DownloadFunction {
  return (requests) =>
    Promise.all(
      requests.map(async ({ url }) => {
        const id = parseAiFileUrl(url.toString())
        if (!id) throw new Error(`Download recusado: esquema "${url.protocol}" não permitido.`)

        const row = await getAiFile(supabase, id)
        if (!row) throw new Error('Anexo não encontrado ou sem acesso.')

        const data = await downloadBytes(supabase, AI_FILES_BUCKET, row.storage_path)
        return { data, mediaType: row.media_type }
      }),
    )
}
