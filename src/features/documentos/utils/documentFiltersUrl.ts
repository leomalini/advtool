import type { MirroredParams } from '@/hooks/useSearchParamsMirror'
import { parseIsoDay, parseOneOf, parseUuid, type ParamReader } from '@/lib/urlParams'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  type DocumentCategory,
  type DocumentOrigin,
} from '@/types/document.types'
import {
  DOCUMENT_FORMAT_LABELS,
  DOCUMENT_LINK_LABELS,
  DOCUMENT_SIGNATURE_FILTER_LABELS,
  emptyDocumentFilters,
  type DocumentFilters,
  type DocumentFormat,
  type DocumentLink,
  type DocumentOriginFilter,
  type DocumentSignatureFilter,
} from './filterDocuments'

/**
 * Os filtros da lista de Documentos na URL (docs/paginacao.md):
 *
 *     ?categoria=procuracao&formato=pdf&vinculo=processo
 *     ?origem=modelo&assinatura=assinado
 *     ?cliente=<id>&processo=<id>&enviado_por=<id>
 *     ?de=2026-10-01&ate=2026-10-31        dia do envio
 *
 * A busca por texto fica FORA, como no Financeiro: o nome de um arquivo
 * costuma ter o nome do cliente, e URLs acabam em logs.
 */
const PARAMS = {
  category: 'categoria',
  format: 'formato',
  link: 'vinculo',
  origin: 'origem',
  signature: 'assinatura',
  clientId: 'cliente',
  legalProcessId: 'processo',
  uploadedBy: 'enviado_por',
  periodFrom: 'de',
  periodTo: 'ate',
} as const

const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]
const FORMATS = Object.keys(DOCUMENT_FORMAT_LABELS) as DocumentFormat[]
const LINKS = Object.keys(DOCUMENT_LINK_LABELS) as DocumentLink[]
const ORIGINS: readonly DocumentOriginFilter[] = [
  ...(Object.keys(DOCUMENT_ORIGIN_LABELS) as DocumentOrigin[]),
  'sem_registro',
]
const SIGNATURES = Object.keys(DOCUMENT_SIGNATURE_FILTER_LABELS) as DocumentSignatureFilter[]

/** Valor inválido cai no padrão (sem filtro), sem erro. */
export function parseDocumentFilters(params: ParamReader): DocumentFilters {
  const periodFrom = parseIsoDay(params.get(PARAMS.periodFrom))
  const periodTo = parseIsoDay(params.get(PARAMS.periodTo))
  // Período invertido não tem resultado possível: fica sem período.
  const inverted = periodFrom !== null && periodTo !== null && periodFrom > periodTo

  return {
    ...emptyDocumentFilters,
    category: parseOneOf(params.get(PARAMS.category), CATEGORIES),
    format: parseOneOf(params.get(PARAMS.format), FORMATS),
    link: parseOneOf(params.get(PARAMS.link), LINKS),
    origin: parseOneOf(params.get(PARAMS.origin), ORIGINS),
    signature: parseOneOf(params.get(PARAMS.signature), SIGNATURES),
    clientId: parseUuid(params.get(PARAMS.clientId)),
    legalProcessId: parseUuid(params.get(PARAMS.legalProcessId)),
    uploadedBy: parseUuid(params.get(PARAMS.uploadedBy)),
    periodFrom: inverted ? null : periodFrom,
    periodTo: inverted ? null : periodTo,
  }
}

/** Todos menos a busca; `null` tira o parâmetro da URL. */
export function serializeDocumentFilters(filters: DocumentFilters): MirroredParams {
  return {
    [PARAMS.category]: filters.category,
    [PARAMS.format]: filters.format,
    [PARAMS.link]: filters.link,
    [PARAMS.origin]: filters.origin,
    [PARAMS.signature]: filters.signature,
    [PARAMS.clientId]: filters.clientId,
    [PARAMS.legalProcessId]: filters.legalProcessId,
    [PARAMS.uploadedBy]: filters.uploadedBy,
    [PARAMS.periodFrom]: filters.periodFrom,
    [PARAMS.periodTo]: filters.periodTo,
  }
}
