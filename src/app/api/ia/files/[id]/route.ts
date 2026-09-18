import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import {
  AI_FILES_BUCKET,
  aiFileKindFromMediaType,
  isReadAsFile,
} from '@/features/ia/files/constants'
import { getAiFile } from '@/features/ia/files/storage'

/** Segundos. Só o tempo de o navegador seguir o redirect. */
const SIGNED_URL_TTL = 60

/**
 * GET /api/ia/files/[id] — abre um anexo ou arquivo gerado da conversa.
 *
 * O link do chat aponta para cá, e não para uma URL assinada: a conversa fica
 * gravada, e uma URL assinada expiraria. Aqui a RLS de `ai_files` decide se o
 * arquivo é de quem pede e só então sai a URL, válida por um minuto.
 *
 * PDF e imagem abrem no navegador; o resto baixa com o nome original.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('ia')
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  }

  const supabase = await createClient()

  let row: Awaited<ReturnType<typeof getAiFile>>
  try {
    row = await getAiFile(supabase, id)
  } catch (error) {
    console.error('[ia] leitura de anexo falhou:', id, error)
    return NextResponse.json({ error: 'Não foi possível abrir o arquivo.' }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  }

  const kind = aiFileKindFromMediaType(row.media_type)
  const opensInline = kind !== null && isReadAsFile(kind)

  const { data, error } = await supabase.storage
    .from(AI_FILES_BUCKET)
    .createSignedUrl(
      row.storage_path,
      SIGNED_URL_TTL,
      opensInline ? undefined : { download: row.file_name },
    )
  if (error || !data) {
    console.error('[ia] URL assinada falhou:', row.storage_path, error?.message)
    return NextResponse.json({ error: 'Não foi possível abrir o arquivo.' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl)
}
