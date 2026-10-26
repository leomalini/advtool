// Server-side only. O documento na D4Sign: subir, cadastrar quem assina,
// enviar, ler o status, baixar o assinado, cancelar, reenviar o link e trocar
// e-mail. O que o spike (2026-10-22) mostrou está nos comentários; o que ainda
// não foi visto (signatários, download) é lido com folga até o primeiro envio
// de verdade.
import { z } from 'zod'
import type { SignerAuthMethod } from '@/types/signature.types'
import { d4signError, d4signRequest } from './client'

/** Acima disso a D4Sign pede o upload de arquivo grande (até 500 MB). */
const BIG_FILE_BYTES = 20 * 1024 * 1024
/** Subir 25 MB numa rede lenta passa dos 30 s das consultas. */
const UPLOAD_TIMEOUT_MS = 90_000

function unexpected(path: string, body: unknown) {
  return d4signError('invalid_response', 502, path, JSON.stringify(body) ?? 'sem corpo')
}

// ── Subir ───────────────────────────────────────────────────────────────────

const uploadedSchema = z.object({ uuid: z.string().min(1) })

export interface UploadFile {
  bytes: Uint8Array
  name: string
  type: string
}

/**
 * Sobe o arquivo para o cofre (e a pasta). Devolve o UUID do documento lá.
 * Resposta vista no spike: `{"message":"success","uuid":"…"}`. Sem envio, o
 * documento fica em "Aguardando Signatários" e não gasta cota.
 */
export async function uploadToSafe(
  safeUuid: string,
  folderUuid: string | null,
  file: UploadFile,
): Promise<string> {
  const big = file.bytes.byteLength > BIG_FILE_BYTES
  const path = `/documents/${encodeURIComponent(safeUuid)}/${big ? 'uploadbigfile' : 'upload'}`
  const form = new FormData()
  form.set('file', new Blob([file.bytes as BlobPart], { type: file.type }), file.name)
  if (folderUuid) form.set('uuid_folder', folderUuid)

  const body = await d4signRequest(path, { form, timeoutMs: UPLOAD_TIMEOUT_MS })
  const parsed = uploadedSchema.safeParse(body)
  if (!parsed.success) throw unexpected(path, body)
  return parsed.data.uuid
}

// ── Quem assina ─────────────────────────────────────────────────────────────

export interface SignerParamsInput {
  email: string
  name: string
  document: string | null
  whatsapp: string | null
  act: number
  auth: SignerAuthMethod
}

/**
 * Um signatário no formato do `createlist`: todo valor em texto. Combinação
 * inválida não dá erro lá — a D4Sign aplica a regra dela e devolve o que
 * valeu —, então cada método liga só o que precisa.
 */
export function signerParams(signer: SignerParamsInput): Record<string, string> {
  const params: Record<string, string> = {
    email: signer.email,
    act: String(signer.act),
    foreign: '0',
    certificadoicpbr: signer.auth === 'icp' ? '1' : '0',
    assinatura_presencial: '0',
  }
  if (signer.whatsapp) params.whatsapp_number = signer.whatsapp

  switch (signer.auth) {
    case 'pix':
      params.auth_pix = '1'
      params.auth_pix_nome = signer.name
      params.auth_pix_cpf = signer.document ?? ''
      break
    case 'documento':
      params.docauth = '1'
      break
    case 'documento_selfie':
      params.docauthandselfie = '1'
      break
    case 'video_selfie':
      params.videoselfie = '1'
      break
    case 'score':
      // A biometria compara com a CNH: pede documento e selfie junto.
      params.docauthandselfie = '1'
      params.d4sign_score = '1'
      params.d4sign_score_nome = signer.name
      params.d4sign_score_cpf = signer.document ?? ''
      break
    case 'icp':
      params.certificadoicpbr_tipo = '1'
      break
    case 'email':
      break
  }
  return params
}

/** Cadastra os signatários. A resposta não é documentada: volta crua, para
 * `findListedSigners` procurar as chaves. */
export async function registerSigners(
  documentUuid: string,
  signers: Record<string, string>[],
): Promise<unknown> {
  return d4signRequest(`/documents/${encodeURIComponent(documentUuid)}/createlist`, {
    json: { signers },
  })
}

export interface ListedSigner {
  email: string
  keySigner: string | null
  signed: boolean
  /** O objeto como veio — guardado como o que a D4Sign aplicou. */
  raw: Record<string, unknown>
}

/**
 * Os signatários dentro de qualquer resposta: todo objeto com `email`. A
 * documentação mostra `list` com `key_signer`, `user_name`, `email` e
 * `signed: "1"`, mas não o envelope — então procura em profundidade.
 */
export function findListedSigners(body: unknown): ListedSigner[] {
  const found: ListedSigner[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    if (typeof record.email === 'string' && record.email.includes('@')) {
      const key = record.key_signer ?? record['key-signer'] ?? record.keySigner
      found.push({
        email: record.email.trim().toLowerCase(),
        keySigner: typeof key === 'string' && key ? key : null,
        signed: record.signed === '1' || record.signed === 1 || record.signed === true,
        raw: record,
      })
    }
    Object.values(record).forEach(visit)
  }
  visit(body)
  return found
}

export async function listSigners(documentUuid: string): Promise<ListedSigner[]> {
  return findListedSigners(
    await d4signRequest(`/documents/${encodeURIComponent(documentUuid)}/list`),
  )
}

// ── Enviar ──────────────────────────────────────────────────────────────────

/** 'yyyy-MM-dd' → 'DD-MM-YYYY', o formato do `sign_limit_date`. */
function limitDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}-${month}-${year}`
}

/**
 * Manda para assinatura — é aqui que a cota do plano é gasta. A D4Sign manda o
 * e-mail (`skip_email: 0`); o portal (fase 4) é um caminho a mais.
 */
export async function sendToSigners(
  documentUuid: string,
  options: { ordered: boolean; message: string | null; deadline: string | null },
): Promise<void> {
  await d4signRequest(`/documents/${encodeURIComponent(documentUuid)}/sendtosigner`, {
    json: {
      skip_email: '0',
      workflow: options.ordered ? '1' : '0',
      ...(options.message ? { message: options.message } : {}),
      ...(options.deadline ? { sign_limit_date: limitDate(options.deadline) } : {}),
    },
  })
}

// ── Ler ─────────────────────────────────────────────────────────────────────

/** 1 processando · 2 aguardando signatários · 3 aguardando assinaturas ·
 * 4 finalizado · 5 arquivado · 6 cancelado · 7 editando. */
export const D4SIGN_PHASES = {
  finished: 4,
  canceled: 6,
} as const

const documentSchema = z.object({
  // Texto no GET ("2"), número na resposta do cancelamento (6) — spike.
  statusId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
  statusName: z.string().nullable().optional(),
  statusComment: z.string().nullable().optional(),
})

export interface D4SignDocumentStatus {
  statusId: number
  statusName: string | null
  statusComment: string | null
}

function parseDocumentStatus(path: string, body: unknown): D4SignDocumentStatus {
  // O GET devolve uma lista com um objeto (spike).
  const parsed = documentSchema.safeParse(Array.isArray(body) ? body[0] : body)
  if (!parsed.success) throw unexpected(path, body)
  return {
    statusId: parsed.data.statusId,
    statusName: parsed.data.statusName ?? null,
    statusComment: parsed.data.statusComment ?? null,
  }
}

/** A fase atual — a prova que vale, já que o aviso só assina o UUID. */
export async function getDocumentStatus(documentUuid: string): Promise<D4SignDocumentStatus> {
  const path = `/documents/${encodeURIComponent(documentUuid)}`
  return parseDocumentStatus(path, await d4signRequest(path))
}

// ── Baixar ──────────────────────────────────────────────────────────────────

const downloadSchema = z.object({ url: z.url(), name: z.string().nullable().optional() })

/**
 * O PDF assinado (com a folha de assinaturas da D4Sign). A API devolve um
 * link (`{url, name}`), baixado na hora — a validade não é documentada.
 * Nunca pede `document: true`, que traria as fotos dos documentos de quem
 * assinou.
 */
export async function downloadSignedPdf(
  documentUuid: string,
): Promise<{ bytes: Uint8Array; name: string | null }> {
  const path = `/documents/${encodeURIComponent(documentUuid)}/download`
  const body = await d4signRequest(path, { json: { type: 'PDF', language: 'pt' } })
  const parsed = downloadSchema.safeParse(body)
  if (!parsed.success) throw unexpected(path, body)

  let response: Response
  try {
    response = await fetch(parsed.data.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
  } catch {
    throw d4signError('unavailable', 502, path, 'o link de download não respondeu')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  // "%PDF-": o link pode devolver uma página de erro com 200.
  const isPdf = bytes.byteLength > 4 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  if (!response.ok || !isPdf) {
    throw d4signError('invalid_response', 502, path, `o link não devolveu um PDF (HTTP ${response.status})`)
  }
  return { bytes, name: parsed.data.name ?? null }
}

// ── Mudar ───────────────────────────────────────────────────────────────────

/** Cancela na D4Sign. Resposta vista no spike: o documento com `statusId: 6`. */
export async function cancelDocument(
  documentUuid: string,
  comment: string | null,
): Promise<D4SignDocumentStatus> {
  const path = `/documents/${encodeURIComponent(documentUuid)}/cancel`
  return parseDocumentStatus(path, await d4signRequest(path, { json: comment ? { comment } : {} }))
}

/** Reenvia o link a um signatário. A D4Sign exige intervalos: 1, 5, 30 e
 * depois 60 minutos entre reenvios. */
export async function resendLink(
  documentUuid: string,
  email: string,
  keySigner: string,
): Promise<void> {
  await d4signRequest(`/documents/${encodeURIComponent(documentUuid)}/resend`, {
    json: { email, key_signer: keySigner },
  })
}

/** Troca o e-mail de um signatário (o de antes, o novo e a chave dele). */
export async function changeSignerEmail(
  documentUuid: string,
  before: string,
  after: string,
  keySigner: string,
): Promise<void> {
  await d4signRequest(`/documents/${encodeURIComponent(documentUuid)}/changeemail`, {
    json: { 'email-before': before, 'email-after': after, 'key-signer': keySigner },
  })
}
