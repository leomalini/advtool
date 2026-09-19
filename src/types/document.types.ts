import type { Profile } from './common.types'
import type { Action, Resource } from './permission.types'

export type DocumentCategory =
  | 'peticao'
  | 'contrato'
  | 'procuracao'
  | 'decisao'
  | 'comprovante'
  | 'nota_fiscal'
  | 'boleto'
  | 'outros'

/** A ordem é a dos seletores — 'outros' fica por último. */
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  peticao: 'Petição',
  contrato: 'Contrato',
  procuracao: 'Procuração',
  decisao: 'Decisão',
  comprovante: 'Comprovante',
  nota_fiscal: 'Nota fiscal',
  boleto: 'Boleto / guia',
  outros: 'Outros',
}

/** O que faz sentido anexar a um lançamento — o seletor do Financeiro oferece
 * só estas. */
export const FINANCIAL_DOCUMENT_CATEGORIES = [
  'comprovante',
  'nota_fiscal',
  'boleto',
  'contrato',
  'outros',
] as const satisfies readonly DocumentCategory[]

export interface DocumentRecord {
  id: string
  client_id: string | null
  crm_item_id: string | null
  legal_process_id: string | null
  event_id: string | null
  /** Lançamento dono do anexo. Exclusivo: com ele preenchido, os demais
   * vínculos ficam vazios (migration 63). */
  financial_entry_id: string | null
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

/** O que getClientDisplayName precisa — mesmo recorte dos embeds. */
interface ClientSummary {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

interface LegalProcessSummary {
  id: string
  cnj_number: string | null
}

export interface DocumentWithRelations extends DocumentRecord {
  client?: ClientSummary | null
  legal_process?: LegalProcessSummary | null
  /** Lançamento dono do anexo. Cliente e processo vêm dele, porque o anexo
   * não tem vínculo próprio. */
  financial_entry?: {
    id: string
    description: string
    client: ClientSummary | null
    legal_process: LegalProcessSummary | null
  } | null
  uploader?: Pick<Profile, 'id' | 'full_name'> | null
}

/** Arquivos escolhidos num formulário, para subir depois de o registro dono
 * existir. */
export interface PendingAttachments {
  files: File[]
  category: DocumentCategory
}

/**
 * Permissão que governa um documento — a mesma escolha das policies da
 * migration 63: anexo de lançamento segue o Financeiro; o resto, o Documentos.
 * Esconder o botão é cosmético; quem impede é a RLS.
 */
export function documentPermission(
  financialEntryId: string | null | undefined,
  operation: 'upload' | 'delete'
): { resource: Resource; action: Action } {
  if (financialEntryId) {
    return { resource: 'financeiro', action: operation === 'upload' ? 'update' : 'delete' }
  }
  return { resource: 'documentos', action: operation === 'upload' ? 'create' : 'delete' }
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
