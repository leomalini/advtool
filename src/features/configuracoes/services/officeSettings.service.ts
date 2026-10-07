import { createClient } from '@/lib/supabase/client'
import { AI_FILE_TYPES, aiFileTypeFromName, sanitizeFileName } from '@/features/ia/files/constants'
import type { OfficeSettings, OfficeSettingsInput } from '@/types/officeSettings.types'

const supabase = createClient()

const BUCKET = 'attachments'

/** A tabela tem uma linha só, de chave `true` (migration 66). */
const ROW_ID = true

export async function getOfficeSettings(): Promise<OfficeSettings | null> {
  const { data, error } = await supabase.from('office_settings').select('*').maybeSingle()
  if (error) throw error
  return (data as OfficeSettings | null) ?? null
}

export async function saveOfficeSettings(
  input: OfficeSettingsInput,
  userId: string,
): Promise<OfficeSettings> {
  const { data, error } = await supabase
    .from('office_settings')
    .upsert({ id: ROW_ID, ...input, updated_by: userId }, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data as OfficeSettings
}

/**
 * Troca a conta InfinitePay que recebe os links. Fluxo próprio, fora do
 * formulário do escritório: mudar para onde o dinheiro vai é decisão à parte,
 * confirmada na tela, e não deve sair junto com uma correção de endereço.
 */
export async function saveInfinitePayHandle(
  handle: string | null,
  userId: string,
): Promise<OfficeSettings> {
  const { data, error } = await supabase
    .from('office_settings')
    .upsert({ id: ROW_ID, infinitepay_handle: handle, updated_by: userId }, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data as OfficeSettings
}

/** O que a InfinitePay respondeu a um link de teste para a tag. */
export type InfinitePayVerification =
  | { ok: true }
  | { ok: false; error: string; code: string | null; actionUrl: string | null }

/**
 * Confere se a InfiniteTag aceita link de pagamento — pela rota, porque quem
 * fala com a InfinitePay é o servidor. Tag errada e conta sem checkout ativado
 * voltam como `ok: false`, com o atalho para ativar; falha de rede é exceção.
 */
export async function verifyInfinitePayHandle(handle: string): Promise<InfinitePayVerification> {
  const response = await fetch('/api/financeiro/infinitepay/verificar-conta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  })
  const body = (await response.json().catch(() => null)) as
    | (InfinitePayVerification & { error?: string })
    | null

  if (!response.ok || !body) {
    throw new Error(body?.error ?? 'Não foi possível verificar a conta agora.')
  }
  return body
}

/** Falhar aqui deixa um arquivo órfão, bem menos grave que desfazer uma troca
 * que já aconteceu — por isso loga e segue. */
async function removeLetterheadFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.error('[escritório] remoção do timbrado falhou:', path, error.message)
}

/**
 * Confere que o arquivo é um .docx que abre, antes de subir: um timbrado
 * quebrado só apareceria quando o Assistente tentasse usá-lo.
 */
async function assertDocx(file: File): Promise<void> {
  if (aiFileTypeFromName(file.name)?.kind !== 'docx') {
    throw new Error('O papel timbrado precisa ser um arquivo .docx (Word).')
  }
  const { default: PizZip } = await import('pizzip')
  try {
    const zip = new PizZip(new Uint8Array(await file.arrayBuffer()))
    if (!zip.file('word/document.xml')) throw new Error('sem corpo')
  } catch {
    throw new Error('O arquivo não é um .docx válido.')
  }
}

/** Sobe o timbrado novo e só então aponta a linha para ele; o antigo sai
 * depois — no meio do caminho, a linha nunca aponta para arquivo que não existe. */
export async function uploadLetterhead(
  file: File,
  current: OfficeSettings | null,
  userId: string,
): Promise<OfficeSettings> {
  await assertDocx(file)

  const path = `escritorio/${Date.now()}-${sanitizeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: AI_FILE_TYPES.docx.mediaType })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('office_settings')
    .upsert(
      { id: ROW_ID, letterhead_path: path, letterhead_file_name: file.name, updated_by: userId },
      { onConflict: 'id' },
    )
    .select('*')
    .single()
  if (error) {
    await removeLetterheadFile(path)
    throw error
  }

  if (current?.letterhead_path) await removeLetterheadFile(current.letterhead_path)
  return data as OfficeSettings
}

export async function removeLetterhead(
  current: OfficeSettings,
  userId: string,
): Promise<OfficeSettings> {
  const { data, error } = await supabase
    .from('office_settings')
    .update({ letterhead_path: null, letterhead_file_name: null, updated_by: userId })
    .eq('id', ROW_ID)
    .select('*')
    .single()
  if (error) throw error

  if (current.letterhead_path) await removeLetterheadFile(current.letterhead_path)
  return data as OfficeSettings
}
