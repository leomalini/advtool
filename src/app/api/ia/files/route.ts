import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { ensureConversation } from '@/features/ia/conversation'
import {
  AI_FILES_BUCKET,
  AI_FILE_MAX_BYTES,
  aiFileTypeFromName,
  isReadAsFile,
} from '@/features/ia/files/constants'
import { extractText } from '@/features/ia/files/extractText'
import { downloadBytes } from '@/features/ia/files/storage'

/** Extrair uma planilha grande leva alguns segundos. */
export const maxDuration = 60

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  storagePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
})

/**
 * POST /api/ia/files — registra um anexo que o navegador acabou de subir.
 *
 * O arquivo em si não passa por aqui: na Vercel o corpo de uma função é pequeno
 * demais para um PDF, então o navegador sobe direto para o bucket `ai-files`
 * (a policy só deixa gravar na pasta do próprio usuário) e chama esta rota com
 * o caminho. Ela confere tudo de novo do lado do servidor — tipo pela extensão,
 * tamanho real do objeto, pasta certa —, extrai o texto de Word/Excel/CSV/TXT e
 * cria a linha em `ai_files`. Se algo falhar depois do upload, o objeto é
 * apagado, para não ficar arquivo sem linha apontando para ele.
 */
export async function POST(request: Request) {
  const guard = await requirePermissionApi('ia')
  if (!guard.ok) return guard.response

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  const { conversationId, storagePath, fileName } = parsed.data

  const type = aiFileTypeFromName(fileName)
  if (!type) {
    return NextResponse.json({ error: 'Formato de arquivo não suportado.' }, { status: 415 })
  }

  // A policy do bucket já prende a primeira pasta ao uid; isto prende também a
  // conversa (que a policy não conhece) e proíbe subpastas.
  const prefix = `${guard.userId}/${conversationId}/`
  const name = storagePath.slice(prefix.length)
  if (!storagePath.startsWith(prefix) || !name || name.includes('/') || name.includes('..')) {
    return NextResponse.json({ error: 'Caminho de arquivo inválido.' }, { status: 400 })
  }

  const supabase = await createClient()

  const conversation = await ensureConversation(supabase, {
    id: conversationId,
    userId: guard.userId,
    title: null,
  })
  if (conversation === 'not-found') {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }
  if (conversation === 'error') {
    return NextResponse.json({ error: 'Não foi possível abrir a conversa.' }, { status: 500 })
  }

  const storage = supabase.storage.from(AI_FILES_BUCKET)
  async function discard() {
    const { error } = await storage.remove([storagePath])
    if (error) console.error('[ia] remoção de anexo falhou:', storagePath, error.message)
  }

  // Baixa sempre: confirma que o objeto existe e dá o tamanho REAL — o que o
  // navegador diz não vale como prova.
  let bytes: Uint8Array
  try {
    bytes = await downloadBytes(supabase, AI_FILES_BUCKET, storagePath)
  } catch (error) {
    console.error('[ia] anexo não encontrado no bucket:', storagePath, error)
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  }

  if (bytes.byteLength > AI_FILE_MAX_BYTES) {
    await discard()
    return NextResponse.json({ error: 'Arquivo maior que 25 MB.' }, { status: 413 })
  }

  let extracted: string | null = null
  if (!isReadAsFile(type.kind)) {
    try {
      extracted = await extractText(type.kind, bytes)
    } catch (error) {
      console.error('[ia] extração de texto falhou:', fileName, error)
      await discard()
      return NextResponse.json(
        { error: 'Não foi possível ler o arquivo. Confira se ele abre normalmente.' },
        { status: 422 },
      )
    }
  }

  const { data: row, error: insertError } = await supabase
    .from('ai_files')
    .insert({
      user_id: guard.userId,
      conversation_id: conversationId,
      origin: 'upload',
      storage_path: storagePath,
      file_name: fileName,
      media_type: type.mediaType,
      size_bytes: bytes.byteLength,
      extracted_text: extracted,
    })
    .select('id')
    .single()

  if (insertError || !row) {
    console.error('[ia] registro de anexo falhou:', insertError?.code, insertError?.message)
    await discard()
    return NextResponse.json({ error: 'Não foi possível registrar o arquivo.' }, { status: 500 })
  }

  return NextResponse.json({
    id: row.id as string,
    fileName,
    mediaType: type.mediaType,
    size: bytes.byteLength,
  })
}
