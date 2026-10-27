import { createClient } from '@/lib/supabase/client'
import { AI_FILE_TYPES, aiFileTypeFromName, sanitizeFileName } from '@/features/ia/files/constants'
import type { D4SignFeatures, D4SignSafe, D4SignSafeMap } from '@/types/d4sign.types'
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

/** Rota de D4Sign: o corpo de erro traz a frase para a tela. */
async function d4signRoute<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init)
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !body) throw new Error(body?.error ?? fallback)
  return body
}

/** Os cofres da conta — pela rota, porque as chaves da D4Sign só existem no
 * servidor. Cada consulta gasta uma das 10 chamadas por hora. */
export async function listD4SignSafes(): Promise<D4SignSafe[]> {
  const body = await d4signRoute<{ safes: D4SignSafe[] }>(
    '/api/assinaturas/d4sign/cofres',
    { method: 'GET' },
    'Não foi possível listar os cofres agora.',
  )
  return body.safes
}

/** O cofre de cada tipo de envio. Escolhido da lista que a D4Sign devolveu;
 * nada a conferir no servidor — um UUID errado só faria a D4Sign recusar o
 * envio. */
export async function saveD4SignSafes(safes: D4SignSafeMap, userId: string): Promise<OfficeSettings> {
  const { data, error } = await supabase
    .from('office_settings')
    .upsert({ id: ROW_ID, d4sign_safes: safes, updated_by: userId }, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data as OfficeSettings
}

/** Lê o saldo de envios na D4Sign e devolve a linha com ele guardado. */
export async function refreshD4SignBalance(): Promise<OfficeSettings> {
  const body = await d4signRoute<{ settings: OfficeSettings }>(
    '/api/assinaturas/d4sign/saldo',
    { method: 'POST' },
    'Não foi possível consultar a D4Sign agora.',
  )
  return body.settings
}

/** Os recursos que o plano libera — só desta tela, a API não informa. */
export async function saveD4SignFeatures(
  features: D4SignFeatures,
  userId: string,
): Promise<OfficeSettings> {
  const { data, error } = await supabase
    .from('office_settings')
    .upsert({ id: ROW_ID, d4sign_features: features, updated_by: userId }, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data as OfficeSettings
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
