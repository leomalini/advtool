import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type { DocumentRecord, DocumentWithRelations } from '@/types/document.types'
import type { DocumentUploadInput } from '@/schemas/document.schema'

const supabase = createClient()

const BUCKET = 'attachments'

const DOCUMENT_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name),
  legal_process:legal_processes(id, cnj_number),
  uploader:profiles!documents_uploaded_by_fkey(id, full_name)
`

/** Controles de formulário devolvem '' quando intocados; Postgres rejeita isso
 * em coluna uuid. Mesmo tratamento de tasks/financialEntries. */
function nullifyEmpty<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = value === '' ? null : value
  }
  return out as T
}

/**
 * Caminho do arquivo dentro do bucket.
 *
 * Convenção única `{tipo}/{id}/{timestamp}-{nome}`. Antes havia duas
 * divergentes — `{clientId}/…` para cliente e `events/{eventId}/…` para evento
 * —, o que tornava impossível saber de quem era um arquivo olhando o caminho.
 * O timestamp evita colisão quando o mesmo arquivo é enviado duas vezes.
 */
function buildFilePath(input: DocumentUploadInput, fileName: string): string {
  const owner: [string, string | null | undefined][] = [
    ['processos', input.legal_process_id],
    ['casos', input.crm_item_id],
    ['clientes', input.client_id],
    ['eventos', input.event_id],
  ]
  const [scope, id] = owner.find(([, value]) => !!value) ?? ['avulsos', 'sem-vinculo']
  // Nome sanitizado: acento e espaço quebram a Storage API do Supabase.
  const safeName = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove os acentos separados pelo NFD
    .replace(/[^a-zA-Z0-9._-]/g, '_')

  return `${scope}/${id}/${Date.now()}-${safeName}`
}

export async function getDocuments(): Promise<DocumentWithRelations[]> {
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as DocumentWithRelations[]
}

/**
 * Documentos de uma entidade.
 *
 * Mesmo vínculo em duas pontas de events/tasks/financial_entries: direto no
 * processo ou através de um dos seus cards de CRM — ver getEventsForEntity.
 */
export async function getDocumentsForEntity(params: {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  eventId?: string | null
}): Promise<DocumentWithRelations[]> {
  const { legalProcessId, crmItemIds = [], clientId, eventId } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guarda: `crm_item_id.in.()` é sintaxe inválida.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (eventId) terms.push(`event_id.eq.${eventId}`)
  if (terms.length === 0) return []

  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .or(terms.join(','))
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as DocumentWithRelations[]
}

export async function uploadDocument(
  input: DocumentUploadInput,
  file: File,
  userId: string
): Promise<DocumentRecord> {
  const filePath = buildFilePath(input, file.name)

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file)
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({
      ...nullifyEmpty(input),
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      // Navegadores deixam o type vazio para extensões desconhecidas.
      file_type: file.type || 'application/octet-stream',
      uploaded_by: userId,
    })
    .select(DOCUMENT_SELECT)
    .single()

  if (error) {
    // Sem isto o arquivo ficaria órfão no bucket, ocupando espaço sem nenhuma
    // linha apontando para ele.
    await supabase.storage.from(BUCKET).remove([filePath])
    throw error
  }

  await recordActivity({
    type: 'attachment_uploaded',
    entity_type: 'document',
    entity_id: data.id,
    entity_title: file.name,
    actor_id: userId,
  })

  return data as unknown as DocumentRecord
}

export async function deleteDocument(id: string, filePath: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error

  // A linha já saiu; falhar aqui deixa um arquivo órfão, o que é bem menos
  // grave que abortar a exclusão pela metade.
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([filePath])
  if (storageError) {
    console.error('[storage] remove failed:', storageError.message)
  }
}

/** URL assinada de curta duração — o bucket é privado, então não há link
 * permanente para o arquivo. */
export async function getDocumentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600)
  if (error) throw error
  return data.signedUrl
}
