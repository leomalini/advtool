import type { Profile } from './common.types'

export type DocumentCategory = 'peticao' | 'contrato' | 'procuracao' | 'decisao' | 'outros'

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  peticao: 'Petição',
  contrato: 'Contrato',
  procuracao: 'Procuração',
  decisao: 'Decisão',
  outros: 'Outros',
}

export interface DocumentRecord {
  id: string
  client_id: string | null
  crm_item_id: string | null
  legal_process_id: string | null
  event_id: string | null
  category: DocumentCategory
  file_name: string
  /** Caminho no bucket 'attachments' — nunca uma URL pública: o bucket é
   * privado, e o acesso é por signed URL de curta duração. */
  file_path: string
  file_size: number
  file_type: string
  uploaded_by: string
  created_at: string
}

export interface DocumentWithRelations extends DocumentRecord {
  client?: {
    id: string
    type: 'individual' | 'company'
    name: string | null
    company_name: string | null
    trade_name: string | null
  } | null
  legal_process?: {
    id: string
    cnj_number: string | null
  } | null
  uploader?: Pick<Profile, 'id' | 'full_name'> | null
}

/** Extensão em maiúsculas, para o badge da lista. */
export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1 || dot === fileName.length - 1) return 'FILE'
  return fileName.slice(dot + 1).toUpperCase()
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
