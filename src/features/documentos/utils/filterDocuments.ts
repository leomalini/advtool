import { format, parseISO } from 'date-fns'
import { getClientDisplayName } from '@/types/cliente.types'
import type {
  DocumentCategory,
  DocumentOrigin,
  DocumentWithRelations,
} from '@/types/document.types'
import type { DocumentSignatureSeal } from '@/types/signature.types'

/** Cliente e processo de um documento. O anexo de lançamento e o arquivo de
 * contrato não têm vínculo próprio (migrations 63 e 69): herdam os do dono,
 * para não aparecer soltos. */
export function documentOwners(doc: DocumentWithRelations) {
  return {
    client: doc.client ?? doc.financial_entry?.client ?? doc.contract?.client ?? null,
    legalProcess:
      doc.legal_process ??
      doc.financial_entry?.legal_process ??
      doc.contract?.legal_process ??
      null,
  }
}

// ── Formato do arquivo ──────────────────────────────────────────────────────

export type DocumentFormat = 'pdf' | 'word' | 'imagem' | 'planilha' | 'outro'

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = {
  pdf: 'PDF',
  word: 'Word / texto',
  imagem: 'Imagem',
  planilha: 'Planilha',
  outro: 'Outro formato',
}

const WORD_EXTENSIONS = ['doc', 'docx', 'odt', 'rtf', 'txt']
const SHEET_EXTENSIONS = ['xls', 'xlsx', 'ods', 'csv']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff']

/** Pelo tipo MIME e, quando ele não diz (`application/octet-stream`), pela
 * extensão do nome. */
export function documentFormatOf(doc: Pick<DocumentWithRelations, 'file_type' | 'file_name'>): DocumentFormat {
  const mime = doc.file_type.toLowerCase()
  const dot = doc.file_name.lastIndexOf('.')
  const extension = dot === -1 ? '' : doc.file_name.slice(dot + 1).toLowerCase()

  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.includes(extension)) return 'imagem'
  if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    mime.includes('opendocument.text') ||
    WORD_EXTENSIONS.includes(extension)
  ) {
    return 'word'
  }
  if (
    mime.includes('spreadsheetml') ||
    mime === 'application/vnd.ms-excel' ||
    mime.includes('opendocument.spreadsheet') ||
    SHEET_EXTENSIONS.includes(extension)
  ) {
    return 'planilha'
  }
  return 'outro'
}

// ── Vínculo ─────────────────────────────────────────────────────────────────

/** Onde o documento está pendurado — o vínculo próprio, não o herdado. */
export type DocumentLink =
  | 'cliente'
  | 'caso'
  | 'processo'
  | 'evento'
  | 'tarefa'
  | 'lancamento'
  | 'contrato'

export const DOCUMENT_LINK_LABELS: Record<DocumentLink, string> = {
  cliente: 'Cliente',
  caso: 'Caso (CRM)',
  processo: 'Processo',
  evento: 'Evento da agenda',
  tarefa: 'Tarefa',
  lancamento: 'Lançamento',
  contrato: 'Contrato',
}

function hasLink(doc: DocumentWithRelations, link: DocumentLink): boolean {
  switch (link) {
    case 'cliente':
      return !!doc.client_id
    case 'caso':
      return !!doc.crm_item_id
    case 'processo':
      return !!doc.legal_process_id
    case 'evento':
      return !!doc.event_id
    case 'tarefa':
      return !!doc.task_id
    case 'lancamento':
      return !!doc.financial_entry_id
    case 'contrato':
      return !!doc.contract_id
  }
}

// ── Origem e assinatura ─────────────────────────────────────────────────────

/** A origem, mais o recorte dos documentos de antes da migration 87. */
export type DocumentOriginFilter = DocumentOrigin | 'sem_registro'

export type DocumentSignatureFilter = 'sem_assinatura' | 'em_assinatura' | 'assinado'

export const DOCUMENT_SIGNATURE_FILTER_LABELS: Record<DocumentSignatureFilter, string> = {
  sem_assinatura: 'Sem assinatura',
  em_assinatura: 'Em assinatura',
  assinado: 'Assinado',
}

function signatureStateOf(seal: DocumentSignatureSeal | undefined): DocumentSignatureFilter {
  if (!seal) return 'sem_assinatura'
  return seal.kind === 'in_progress' ? 'em_assinatura' : 'assinado'
}

// ── Filtros ─────────────────────────────────────────────────────────────────

export interface DocumentFilters {
  search: string
  category: DocumentCategory | null
  format: DocumentFormat | null
  link: DocumentLink | null
  origin: DocumentOriginFilter | null
  signature: DocumentSignatureFilter | null
  clientId: string | null
  legalProcessId: string | null
  uploadedBy: string | null
  /** Dia do envio, ISO (yyyy-mm-dd), inclusivo, no fuso de quem olha. */
  periodFrom: string | null
  periodTo: string | null
}

export const emptyDocumentFilters: DocumentFilters = {
  search: '',
  category: null,
  format: null,
  link: null,
  origin: null,
  signature: null,
  clientId: null,
  legalProcessId: null,
  uploadedBy: null,
  periodFrom: null,
  periodTo: null,
}

export function countActiveDocumentFilters(filters: DocumentFilters): number {
  return (Object.keys(filters) as (keyof DocumentFilters)[]).filter((key) =>
    key === 'search' ? filters.search.trim() !== '' : filters[key] !== null
  ).length
}

export function hasActiveDocumentFilters(filters: DocumentFilters): boolean {
  return countActiveDocumentFilters(filters) > 0
}

function matchesSearch(doc: DocumentWithRelations, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const qDigits = q.replace(/\D/g, '')

  const { client, legalProcess } = documentOwners(doc)
  const haystack = [
    doc.file_name,
    client ? getClientDisplayName(client as Parameters<typeof getClientDisplayName>[0]) : null,
    legalProcess?.cnj_number,
    doc.financial_entry?.description,
    doc.contract?.title,
    doc.task?.title,
    doc.event?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const matchesText = haystack.includes(q)
  const matchesDigits =
    qDigits.length > 0 && (legalProcess?.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

  return matchesText || matchesDigits
}

/**
 * Aplica os filtros. Cliente e processo valem pelo dono mostrado na tabela —
 * o próprio ou o herdado do lançamento/contrato —, para o filtro concordar com
 * o que a linha diz. O selo de assinatura só entra quando a integração está
 * ligada (`seals` vazio de outro modo, e o filtro some da barra).
 */
export function filterDocuments(
  documents: DocumentWithRelations[],
  filters: DocumentFilters,
  seals: ReadonlyMap<string, DocumentSignatureSeal>
): DocumentWithRelations[] {
  return documents.filter((doc) => {
    if (filters.category && doc.category !== filters.category) return false
    if (filters.format && documentFormatOf(doc) !== filters.format) return false
    if (filters.link && !hasLink(doc, filters.link)) return false
    if (filters.origin && (doc.origin ?? 'sem_registro') !== filters.origin) return false
    if (filters.signature && signatureStateOf(seals.get(doc.id)) !== filters.signature) {
      return false
    }
    if (filters.uploadedBy && doc.uploaded_by !== filters.uploadedBy) return false

    if (filters.clientId || filters.legalProcessId) {
      const { client, legalProcess } = documentOwners(doc)
      if (filters.clientId && client?.id !== filters.clientId) return false
      if (filters.legalProcessId && legalProcess?.id !== filters.legalProcessId) return false
    }

    if (filters.periodFrom || filters.periodTo) {
      const day = format(parseISO(doc.created_at), 'yyyy-MM-dd')
      if (filters.periodFrom && day < filters.periodFrom) return false
      if (filters.periodTo && day > filters.periodTo) return false
    }

    return matchesSearch(doc, filters.search)
  })
}
