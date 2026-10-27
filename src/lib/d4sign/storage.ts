// Server-side. O arquivo que vai para a D4Sign e a cópia assinada que volta,
// no bucket `attachments`, pela service_role.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentRecord } from '@/types/document.types'
import type { SignatureRequest } from '@/types/signature.types'

const BUCKET = 'attachments'

/** O que o envio precisa do documento original. */
export type OriginalDocument = Pick<
  DocumentRecord,
  | 'id'
  | 'file_name'
  | 'file_path'
  | 'file_type'
  | 'category'
  | 'client_id'
  | 'crm_item_id'
  | 'legal_process_id'
  | 'event_id'
  | 'contract_id'
> & { movement_id: string | null }

export async function loadOriginalDocument(
  supabase: SupabaseClient,
  documentId: string | null,
): Promise<OriginalDocument | null> {
  if (!documentId) return null
  const { data, error } = await supabase
    .from('documents')
    .select(
      'id, file_name, file_path, file_type, category, client_id, crm_item_id, ' +
        'legal_process_id, event_id, movement_id, contract_id',
    )
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw error
  return (data as OriginalDocument | null) ?? null
}

export async function readStoredFile(supabase: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('Não foi possível ler o arquivo no Storage.')
  return new Uint8Array(await data.arrayBuffer())
}

/** Sem acento e sem espaço: a Storage API do Supabase recusa (o mesmo cuidado
 * de `buildFilePath` em documents.service.ts). */
function safeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** "Contrato.docx" → "Contrato (assinado).pdf". */
export function signedFileName(original: string): string {
  const base = original.replace(/\.[^./\\]+$/, '') || 'Documento'
  return `${base} (assinado).pdf`
}

/**
 * Onde a cópia assinada mora: no contrato, como `assinado`; fora dele, com os
 * mesmos donos do original. A pasta segue a convenção de `buildFilePath`, que
 * é o critério das policies do bucket (migrations 63 e 69).
 */
function placement(request: SignatureRequest, original: OriginalDocument | null) {
  if (request.contract_id) {
    return {
      folder: `contratos/${request.contract_id}`,
      columns: {
        contract_id: request.contract_id,
        contract_file_role: 'assinado',
        category: 'contrato',
      },
    }
  }

  const owners = {
    client_id: original?.client_id ?? request.client_id,
    crm_item_id: original?.crm_item_id ?? null,
    legal_process_id: original?.legal_process_id ?? null,
    event_id: original?.event_id ?? null,
    movement_id: original?.movement_id ?? null,
  }
  const folder: [string, string | null][] = [
    ['processos', owners.legal_process_id],
    ['casos', owners.crm_item_id],
    ['clientes', owners.client_id],
    ['eventos', owners.event_id],
  ]
  const [scope, id] = folder.find(([, value]) => !!value) ?? ['avulsos', 'sem-vinculo']
  return {
    folder: `${scope}/${id}`,
    columns: { ...owners, category: original?.category ?? 'outros' },
  }
}

/** Sobe a cópia assinada e cria a linha em `documents`. Devolve o id. */
export async function storeSignedCopy(
  supabase: SupabaseClient,
  request: SignatureRequest,
  original: OriginalDocument | null,
  bytes: Uint8Array,
): Promise<{ id: string; path: string }> {
  const fileName = signedFileName(original?.file_name ?? request.title)
  const { folder, columns } = placement(request, original)
  const path = `${folder}/${Date.now()}-${safeName(fileName)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf' })
  if (uploadError) throw new Error(`Cópia assinada não gravada no Storage: ${uploadError.message}`)

  const { data, error } = await supabase
    .from('documents')
    .insert({
      ...columns,
      file_name: fileName,
      file_path: path,
      file_size: bytes.byteLength,
      file_type: 'application/pdf',
      // Quem enviou para assinatura — o aviso da D4Sign não tem autor.
      uploaded_by: request.created_by,
    })
    .select('id')
    .single()

  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`Cópia assinada não registrada: ${error?.message ?? 'sem resposta'}`)
  }
  return { id: data.id as string, path }
}

/** Desfaz a cópia quando outro caminho (o webhook e o "Atualizar status" ao
 * mesmo tempo) já finalizou o envio. */
export async function removeSignedCopy(
  supabase: SupabaseClient,
  copy: { id: string; path: string },
): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', copy.id)
  if (error) console.error('[d4sign] cópia repetida não removida:', copy.id, error.message)
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([copy.path])
  if (storageError) console.error('[d4sign] arquivo repetido não removido:', copy.path, storageError.message)
}
