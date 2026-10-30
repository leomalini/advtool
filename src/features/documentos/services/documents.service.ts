import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type {
  DocumentCategory,
  DocumentRecord,
  DocumentWithRelations,
} from '@/types/document.types'
import type { DocumentUploadInput } from '@/schemas/document.schema'
import { chunk } from '@/utils/chunk'

const supabase = createClient()

const BUCKET = 'attachments'

const DOCUMENT_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name),
  legal_process:legal_processes(id, cnj_number),
  financial_entry:financial_entries(
    id,
    description,
    client:clients(id, type, name, company_name, trade_name),
    legal_process:legal_processes(id, cnj_number)
  ),
  contract:contracts(
    id,
    title,
    client:clients(id, type, name, company_name, trade_name),
    legal_process:legal_processes(id, cnj_number)
  ),
  task:tasks(id, title),
  event:events(id, title),
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
 *
 * ⚠️ `lancamentos` e `contratos` vêm primeiro e não é só organização: é pela
 * pasta que as policies do bucket reconhecem um anexo de lançamento
 * (migration 63) e um arquivo de contrato (migration 69).
 */
function buildFilePath(input: DocumentUploadInput, fileName: string): string {
  const owner: [string, string | null | undefined][] = [
    ['lancamentos', input.financial_entry_id],
    ['contratos', input.contract_id],
    ['processos', input.legal_process_id],
    ['casos', input.crm_item_id],
    ['clientes', input.client_id],
    ['eventos', input.event_id],
    ['tarefas', input.task_id],
  ]
  const [scope, id] = owner.find(([, value]) => !!value) ?? ['avulsos', 'sem-vinculo']
  // Nome sanitizado: acento e espaço quebram a Storage API do Supabase.
  const safeName = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove os acentos separados pelo NFD
    .replace(/[^a-zA-Z0-9._-]/g, '_')

  return `${scope}/${id}/${Date.now()}-${safeName}`
}

/** Um documento pela linha crua — onde ele mora e de que tipo é. */
export async function getDocumentRecord(id: string): Promise<DocumentRecord | null> {
  const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as DocumentRecord | null) ?? null
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
  taskId?: string | null
  financialEntryId?: string | null
  contractId?: string | null
}): Promise<DocumentWithRelations[]> {
  const {
    legalProcessId,
    crmItemIds = [],
    clientId,
    eventId,
    taskId,
    financialEntryId,
    contractId,
  } = params

  const terms: string[] = []
  if (legalProcessId) terms.push(`legal_process_id.eq.${legalProcessId}`)
  // Guarda: `crm_item_id.in.()` é sintaxe inválida.
  if (crmItemIds.length > 0) terms.push(`crm_item_id.in.(${crmItemIds.join(',')})`)
  if (clientId) terms.push(`client_id.eq.${clientId}`)
  if (eventId) terms.push(`event_id.eq.${eventId}`)
  if (taskId) terms.push(`task_id.eq.${taskId}`)
  if (financialEntryId) terms.push(`financial_entry_id.eq.${financialEntryId}`)
  if (contractId) terms.push(`contract_id.eq.${contractId}`)
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
    // O feed é lido por qualquer membro; a marca é o que permite, um dia,
    // escondê-lo de quem não vê o Financeiro ou os Contratos.
    metadata: input.financial_entry_id
      ? { financial_entry_id: input.financial_entry_id }
      : input.contract_id
        ? { contract_id: input.contract_id }
        : undefined,
  })

  return data as unknown as DocumentRecord
}

/**
 * Remove do bucket arquivos cujas linhas já saíram.
 *
 * Falhar aqui deixa arquivo órfão, o que é bem menos grave que abortar pela
 * metade uma exclusão que já aconteceu — por isso loga e segue.
 */
export async function removeDocumentFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(filePaths)
  if (error) console.error('[storage] remove failed:', error.message)
}

/** Troca a categoria de um documento já enviado. A RLS de update segue o dono
 * (migration 69), como o resto. */
export async function updateDocumentCategory(id: string, category: DocumentCategory): Promise<void> {
  const { data, error } = await supabase
    .from('documents')
    .update({ category })
    .eq('id', id)
    .select('id')
  if (error) throw error
  // Sem permissão a RLS recusa em silêncio (0 linhas).
  if (!data || data.length === 0) throw new Error('Sem permissão para alterar este documento.')
}

export async function deleteDocument(id: string, filePath: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error

  await removeDocumentFiles([filePath])
}

/**
 * Caminhos dos anexos de um lançamento, lidos ANTES de excluí-lo.
 *
 * As linhas saem sozinhas, pelo cascade da migration 63, mas o banco não
 * alcança o bucket. Depois da exclusão não sobra linha para dizer quais
 * arquivos remover.
 */
export async function getFinancialEntryFilePaths(financialEntryId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('file_path')
    .eq('financial_entry_id', financialEntryId)

  if (error) throw error
  return (data ?? []).map((doc) => doc.file_path as string)
}

/** Caminhos dos arquivos de um contrato, lidos ANTES de excluí-lo — mesmo
 * motivo de `getFinancialEntryFilePaths` (cascade da migration 69). */
export async function getContractFilePaths(contractId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('file_path')
    .eq('contract_id', contractId)

  if (error) throw error
  return (data ?? []).map((doc) => doc.file_path as string)
}

/** Há documento anexado só ao evento (ou à tarefa), e o perfil não pode
 * excluí-lo. */
export class AttachedDocumentsError extends Error {
  constructor(owner: 'evento' | 'tarefa' = 'evento') {
    super(
      `Há documentos anexados só a ${owner === 'evento' ? 'este evento' : 'esta tarefa'}, e você ` +
        'não tem permissão para excluí-los.'
    )
    this.name = 'AttachedDocumentsError'
  }
}

/**
 * Exclui — linha e arquivo — os documentos que pertencem SÓ a estes eventos.
 *
 * Tem de rodar antes de excluir os eventos: `documents.event_id` é
 * `on delete set null`, e um documento sem nenhum outro vínculo violaria o
 * CHECK `chk_documents_has_parent` (migration 23) — o que fazia a exclusão do
 * evento falhar inteira. Documento que também é do processo, do cliente ou do
 * card fica: perde só o vínculo com o evento.
 *
 * A RLS de `documents` recusa em silêncio (0 linhas) quem não tem
 * `documentos:delete`; conferir a contagem é o que transforma isso num erro
 * que a tela consegue explicar, em vez do CHECK estourando depois.
 */
export async function deleteEventOnlyDocuments(eventIds: string[]): Promise<void> {
  await deleteOwnedOnlyDocuments('event_id', eventIds)
}

/** O mesmo de `deleteEventOnlyDocuments`, para a tarefa (migration 87). Roda
 * antes de excluir as tarefas, pelo mesmo motivo. */
export async function deleteTaskOnlyDocuments(taskIds: string[]): Promise<void> {
  await deleteOwnedOnlyDocuments('task_id', taskIds)
}

/** Documentos cujo único dono é um destes eventos ou tarefas. */
async function deleteOwnedOnlyDocuments(
  column: 'event_id' | 'task_id',
  ownerIds: string[]
): Promise<void> {
  if (ownerIds.length === 0) return
  const otherOwner = column === 'event_id' ? 'task_id' : 'event_id'

  const owned: { id: string; file_path: string }[] = []
  for (const ids of chunk(ownerIds)) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, file_path')
      .in(column, ids)
      .is('client_id', null)
      .is('crm_item_id', null)
      .is('legal_process_id', null)
      .is(otherOwner, null)
    if (error) throw error
    owned.push(...((data ?? []) as { id: string; file_path: string }[]))
  }
  if (owned.length === 0) return

  let deleted = 0
  for (const ids of chunk(owned.map((doc) => doc.id))) {
    const { data, error } = await supabase.from('documents').delete().in('id', ids).select('id')
    if (error) throw error
    deleted += data?.length ?? 0
  }
  if (deleted < owned.length) {
    throw new AttachedDocumentsError(column === 'event_id' ? 'evento' : 'tarefa')
  }

  await removeDocumentFiles(owned.map((doc) => doc.file_path))
}

/**
 * Repassa para `toEventId` os documentos dos eventos em `fromEventIds`.
 *
 * Usado quando uma série é refeita: as ocorrências antigas saem, e os arquivos
 * anexados a elas iriam junto. Ficam na ocorrência que foi editada — a única
 * que sobrevive à troca.
 */
export async function moveEventDocuments(fromEventIds: string[], toEventId: string): Promise<void> {
  for (const ids of chunk(fromEventIds)) {
    const { error } = await supabase
      .from('documents')
      .update({ event_id: toEventId })
      .in('event_id', ids)
    if (error) throw error
  }
}

/** O mesmo de `moveEventDocuments`, quando a série de uma tarefa é refeita. */
export async function moveTaskDocuments(fromTaskIds: string[], toTaskId: string): Promise<void> {
  for (const ids of chunk(fromTaskIds)) {
    const { error } = await supabase
      .from('documents')
      .update({ task_id: toTaskId })
      .in('task_id', ids)
    if (error) throw error
  }
}

/** URL assinada de curta duração — o bucket é privado, então não há link
 * permanente para o arquivo. */
export async function getDocumentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600)
  if (error) throw error
  return data.signedUrl
}
