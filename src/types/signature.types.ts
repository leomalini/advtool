/**
 * Envios para assinatura (migrations 79 e 80). Espelha `signature_requests` e
 * `signature_signers`; sem nada de servidor. Plano em
 * `docs/integracao-d4sign.md`.
 */

import type { D4SignFeature, D4SignFeatures } from './d4sign.types'

export type SignatureRequestStatus = 'preparing' | 'sent' | 'signed' | 'canceled' | 'failed'

/** O que vai para assinatura: PDF ou Word (a D4Sign converte o Word). */
export const SIGNABLE_FILE_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/** Os passos do envio, na ordem. "Tentar de novo" continua do que falhou. */
export const SIGNATURE_STEPS = ['folder', 'upload', 'webhook', 'signers', 'send'] as const

export type SignatureStep = (typeof SIGNATURE_STEPS)[number]

export const SIGNATURE_STEP_LABELS: Record<SignatureStep, string> = {
  folder: 'pasta do cliente',
  upload: 'envio do arquivo',
  webhook: 'registro dos avisos',
  signers: 'cadastro dos signatários',
  send: 'envio para assinatura',
}

export type SignatureSignerStatus = 'pending' | 'signed' | 'email_failed'

export const SIGNATURE_REQUEST_STATUS_LABELS: Record<SignatureRequestStatus, string> = {
  preparing: 'Preparando',
  sent: 'Em assinatura',
  signed: 'Assinado',
  canceled: 'Cancelado',
  failed: 'Falhou',
}

export const SIGNATURE_SIGNER_STATUS_LABELS: Record<SignatureSignerStatus, string> = {
  pending: 'Pendente',
  signed: 'Assinou',
  email_failed: 'E-mail não entregue',
}

/** Envio aberto: ainda pode virar assinatura (ou ser cancelado). */
export const OPEN_SIGNATURE_STATUSES: readonly SignatureRequestStatus[] = ['preparing', 'sent']

/** Envio que ainda não terminou: aberto ou parado num passo. Enquanto houver
 * um, não sai outro do mesmo arquivo — o que falhou continua ou é cancelado. */
export const UNFINISHED_SIGNATURE_STATUSES: readonly SignatureRequestStatus[] = [
  ...OPEN_SIGNATURE_STATUSES,
  'failed',
]

/**
 * O papel de quem assina na D4Sign (`act`). Os que a tela oferece — a D4Sign
 * tem 13; os outros (emissor, endossante, avalista…) não aparecem nos
 * contratos do escritório.
 */
export const SIGNATURE_ACTS = [4, 5, 6, 10, 1, 7] as const

export type SignatureAct = (typeof SIGNATURE_ACTS)[number]

export const SIGNATURE_ACT_LABELS: Record<SignatureAct, string> = {
  4: 'Parte',
  5: 'Testemunha',
  6: 'Interveniente / anuente',
  10: 'Fiador',
  1: 'Assinar',
  7: 'Acusar recebimento',
}

/** O papel da parte no contrato → o papel na D4Sign. */
export function actForRole(roleKey: string): SignatureAct {
  if (roleKey.startsWith('testemunha')) return 5
  if (roleKey.startsWith('fiador')) return 10
  if (roleKey.includes('anuente') || roleKey.startsWith('interveniente')) return 6
  return 4
}

/**
 * Como o signatário confirma quem é. `email` é o código por e-mail, sempre
 * disponível; os outros só aparecem quando o recurso do plano está ligado em
 * Configurações → Assinatura.
 */
export const SIGNER_AUTH_METHODS = [
  'email',
  'pix',
  'documento',
  'documento_selfie',
  'video_selfie',
  'score',
  'icp',
] as const

export type SignerAuthMethod = (typeof SIGNER_AUTH_METHODS)[number]

export const SIGNER_AUTH_LABELS: Record<SignerAuthMethod, string> = {
  email: 'Código por e-mail',
  pix: 'Pix',
  documento: 'Documento com foto',
  documento_selfie: 'Documento e selfie',
  video_selfie: 'Vídeo-selfie',
  score: 'Biometria (D4Sign Score)',
  icp: 'Certificado ICP-Brasil',
}

/** Métodos que exigem o CPF do signatário. */
export const AUTH_METHODS_NEEDING_CPF: readonly SignerAuthMethod[] = ['pix', 'score']

/** O recurso do plano que libera cada método; `email` vale sempre. */
export const AUTH_METHOD_FEATURE: Record<Exclude<SignerAuthMethod, 'email'>, D4SignFeature> = {
  pix: 'pix',
  documento: 'selfie',
  documento_selfie: 'selfie',
  video_selfie: 'video_selfie',
  score: 'score',
  icp: 'icp',
}

/** Os métodos que o plano libera, na ordem do seletor. */
export function availableAuthMethods(features: D4SignFeatures): SignerAuthMethod[] {
  return SIGNER_AUTH_METHODS.filter(
    (method) => method === 'email' || features[AUTH_METHOD_FEATURE[method]] === true,
  )
}

export interface SignatureSigner {
  id: string
  request_id: string
  position: number
  name: string
  email: string
  document: string | null
  whatsapp_number: string | null
  act: number
  contract_party_id: string | null
  client_id: string | null
  profile_id: string | null
  auth_requested: { method?: SignerAuthMethod } & Record<string, unknown>
  auth_applied: Record<string, unknown> | null
  via_portal: boolean
  key_signer: string | null
  status: SignatureSignerStatus
  signed_at: string | null
  created_at: string
  updated_at: string
}

export interface SignatureRequest {
  id: string
  provider: 'd4sign'
  document_id: string | null
  contract_id: string | null
  client_id: string | null
  external_id: string | null
  safe_uuid: string | null
  folder_uuid: string | null
  title: string
  status: SignatureRequestStatus
  failed_step: SignatureStep | null
  ordered: boolean
  message: string | null
  deadline: string | null
  signed_document_id: string | null
  sent_at: string | null
  finished_at: string | null
  canceled_at: string | null
  cancel_reason: string | null
  error: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SignatureRequestWithSigners extends SignatureRequest {
  signers: SignatureSigner[]
}
