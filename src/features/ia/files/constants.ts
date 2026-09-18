/**
 * Tipos de arquivo do Assistente — usado no browser (validar antes de subir) e
 * no servidor (registrar e montar o que o modelo recebe).
 *
 * Quem decide o tipo é a EXTENSÃO, não `File.type`: o MIME que o navegador
 * informa varia por sistema (o Windows com Excel chama .csv de
 * `application/vnd.ms-excel`), e o bucket só aceita os MIME desta lista
 * (migration 61). O upload manda o `contentType` daqui.
 */

export type AiFileKind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'csv' | 'txt'

export interface AiFileType {
  kind: AiFileKind
  mediaType: string
}

const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const AI_FILE_TYPES: Readonly<Record<string, AiFileType>> = {
  pdf: { kind: 'pdf', mediaType: 'application/pdf' },
  png: { kind: 'image', mediaType: 'image/png' },
  jpg: { kind: 'image', mediaType: 'image/jpeg' },
  jpeg: { kind: 'image', mediaType: 'image/jpeg' },
  webp: { kind: 'image', mediaType: 'image/webp' },
  heic: { kind: 'image', mediaType: 'image/heic' },
  heif: { kind: 'image', mediaType: 'image/heif' },
  docx: { kind: 'docx', mediaType: DOCX_MEDIA_TYPE },
  xlsx: { kind: 'xlsx', mediaType: XLSX_MEDIA_TYPE },
  csv: { kind: 'csv', mediaType: 'text/csv' },
  txt: { kind: 'txt', mediaType: 'text/plain' },
}

/** `accept` do `<input type="file">`. */
export const AI_FILE_ACCEPT = Object.keys(AI_FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(',')

/** Igual ao `file_size_limit` do bucket (migration 61) e ao `MAX_FILE_SIZE` de
 * Documentos — um anexo sempre cabe quando é salvo lá. */
export const AI_FILE_MAX_BYTES = 25 * 1024 * 1024

/** Por mensagem. O Gemini aceita até 100 MB por pedido; cinco de 25 MB já
 * passariam disso, mas o caso real é um ou dois documentos. */
export const AI_FILES_PER_MESSAGE = 5

export const AI_FILES_BUCKET = 'ai-files'

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function aiFileTypeFromName(fileName: string): AiFileType | null {
  return AI_FILE_TYPES[extensionOf(fileName)] ?? null
}

/** Para linhas que já têm o MIME gravado (anexos, documentos cadastrados). */
export function aiFileKindFromMediaType(mediaType: string): AiFileKind | null {
  const match = Object.values(AI_FILE_TYPES).find((type) => type.mediaType === mediaType)
  return match?.kind ?? null
}

/** PDF e imagem o modelo lê no original; o resto vai como texto extraído. */
export function isReadAsFile(kind: AiFileKind): boolean {
  return kind === 'pdf' || kind === 'image'
}

/**
 * Referência de anexo dentro de uma mensagem: `ai-file://<id>`.
 *
 * A conversa guarda só isto — nunca os bytes nem uma URL assinada, que
 * expiraria. Quem transforma a referência em arquivo é o servidor, com a RLS
 * de quem pergunta.
 */
const AI_FILE_PROTOCOL = 'ai-file:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function toAiFileUrl(id: string): string {
  return `${AI_FILE_PROTOCOL}//${id}`
}

export function parseAiFileUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== AI_FILE_PROTOCOL) return null
    // Só o id: caminho, query ou fragmento tornariam a referência ambígua.
    if (parsed.pathname !== '' || parsed.search !== '' || parsed.hash !== '') return null
    return UUID_PATTERN.test(parsed.hostname) ? parsed.hostname : null
  } catch {
    return null
  }
}

/** Link de download/visualização de um anexo (redireciona para URL assinada). */
export function aiFileHref(id: string): string {
  return `/api/ia/files/${id}`
}

/** Mesma limpeza de `documents.service.ts`: acento e espaço quebram a Storage
 * API do Supabase. */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    // \p{M}: as marcas de acento que o NFD separou da letra.
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** `<user_id>/<conversation_id>/<uuid>-<nome>` — a primeira pasta é o dono, e é
 * ela que as policies do bucket conferem. */
export function buildAiFilePath(userId: string, conversationId: string, fileName: string): string {
  return `${userId}/${conversationId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`
}
