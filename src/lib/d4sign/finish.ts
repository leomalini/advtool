// Server-side. O que um aviso da D4Sign (ou o "Atualizar status") muda: todos
// assinaram, cancelado, alguém assinou, e-mail não entregue.
//
// O aviso só assina o UUID, não o corpo: finalizar e cancelar acontecem só
// depois de a API confirmar a fase. Assinatura de uma pessoa e e-mail não
// entregue entram como pista — não mudam o contrato, e conferir cada um
// gastaria o limite de chamadas.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebhookEventDestination, WebhookEventStatus } from '@/types/webhookEvent.types'
import type { SignatureRequestWithSigners } from '@/types/signature.types'
import {
  D4SIGN_PHASES,
  downloadSignedPdf,
  getDocumentStatus,
  listSigners,
  type D4SignDocumentStatus,
} from './documents'
import { notifySignature, updateSigner } from './requests'
import { loadOriginalDocument, removeSignedCopy, storeSignedCopy } from './storage'

export interface ProcessOutcome {
  status: Extract<WebhookEventStatus, 'processed' | 'duplicate' | 'ignored'>
  reason: string | null
  destinations: WebhookEventDestination[]
}

type Via = 'webhook' | 'sync'

/**
 * Data e hora da D4Sign → ISO. O aviso real veio sem fuso
 * (`2026-10-22T22:19:52`), em horário de Brasília (spike); com fuso, vale o
 * dele.
 */
export function parseD4SignDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const date = new Date(`${trimmed}-03:00`)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const date = new Date(trimmed)
  return /\d{4}-\d{2}-\d{2}T/.test(trimmed) && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : null
}

function phaseName(status: D4SignDocumentStatus): string {
  return status.statusName ? `"${status.statusName}"` : `a fase ${status.statusId}`
}

/**
 * Todos assinaram: confere na API, baixa o PDF, guarda a cópia e grava envio
 * e contrato numa transação (`finish_signature_request`, migration 80).
 */
export async function finishRequest(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
  options: { signedAt: string | null; via: Via; confirmed?: D4SignDocumentStatus },
): Promise<ProcessOutcome> {
  if (request.status === 'signed') {
    return { status: 'duplicate', reason: 'O envio já estava assinado.', destinations: [] }
  }
  if (request.status !== 'sent' || !request.external_id) {
    return { status: 'ignored', reason: `O envio está "${request.status}".`, destinations: [] }
  }

  const phase = options.confirmed ?? (await getDocumentStatus(request.external_id))
  if (phase.statusId !== D4SIGN_PHASES.finished) {
    return {
      status: 'ignored',
      reason: `A D4Sign diz que o documento está em ${phaseName(phase)}: nada muda.`,
      destinations: [],
    }
  }

  const original = await loadOriginalDocument(supabase, request.document_id)
  const pdf = await downloadSignedPdf(request.external_id)
  const copy = await storeSignedCopy(supabase, request, original, pdf.bytes)

  const { data, error } = await supabase.rpc('finish_signature_request', {
    p_request_id: request.id,
    p_signed_document_id: copy.id,
    p_signed_at: options.signedAt,
  })
  if (error) {
    await removeSignedCopy(supabase, copy)
    throw new Error(`Envio não finalizado no banco: ${error.message}`)
  }

  const result = data as { finished: boolean; contract_updated?: boolean; reason?: string }
  if (!result.finished) {
    // O outro caminho (aviso ou "Atualizar status") chegou primeiro.
    await removeSignedCopy(supabase, copy)
    return { status: 'duplicate', reason: 'Outro aviso já finalizou o envio.', destinations: [] }
  }

  await notifySignature(supabase, request, {
    kind: 'assinatura_concluida',
    title: 'Assinado por todos',
    body: result.contract_updated
      ? `${request.title} — o contrato passou a vigente.`
      : request.title,
    via: options.via,
  })

  return {
    status: 'processed',
    reason: null,
    destinations: [
      { table: 'signature_requests', id: request.id, action: 'updated' },
      { table: 'documents', id: copy.id, action: 'inserted', detail: 'cópia assinada' },
      ...(result.contract_updated && request.contract_id
        ? [
            {
              table: 'contracts',
              id: request.contract_id,
              action: 'updated' as const,
              link: `/contratos/${request.contract_id}`,
              detail: 'vigente',
            },
          ]
        : []),
    ],
  }
}

/**
 * Cancelado na D4Sign (painel, prazo vencido): confere e grava envio e
 * contrato juntos (`cancel_signature_request`), com o histórico "pela D4Sign".
 */
export async function cancelFromD4Sign(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
  options: { reason: string | null; via: Via; confirmed?: D4SignDocumentStatus },
): Promise<ProcessOutcome> {
  if (request.status === 'canceled') {
    return { status: 'duplicate', reason: 'O envio já estava cancelado.', destinations: [] }
  }
  if (request.status === 'signed' || !request.external_id) {
    return { status: 'ignored', reason: `O envio está "${request.status}".`, destinations: [] }
  }

  const phase = options.confirmed ?? (await getDocumentStatus(request.external_id))
  if (phase.statusId !== D4SIGN_PHASES.canceled) {
    return {
      status: 'ignored',
      reason: `A D4Sign diz que o documento está em ${phaseName(phase)}: nada muda.`,
      destinations: [],
    }
  }

  const { data, error } = await supabase.rpc('cancel_signature_request', {
    p_request_id: request.id,
    p_reason: options.reason ?? phase.statusComment,
    p_source: 'd4sign',
    p_actor: null,
  })
  if (error) throw new Error(`Cancelamento não gravado: ${error.message}`)

  const result = data as { canceled: boolean; contract_updated?: boolean }
  if (!result.canceled) {
    return { status: 'duplicate', reason: 'O envio já tinha terminado.', destinations: [] }
  }

  await notifySignature(supabase, request, {
    kind: 'assinatura_cancelada',
    title: 'Envio cancelado na D4Sign',
    body: result.contract_updated
      ? `${request.title} — o contrato voltou a rascunho.`
      : request.title,
    via: options.via,
  })

  return {
    status: 'processed',
    reason: null,
    destinations: [{ table: 'signature_requests', id: request.id, action: 'updated' }],
  }
}

/** Uma pessoa assinou, ou o e-mail dela voltou — pista, sem mexer no contrato. */
export async function markSignerFromNotice(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
  options: { email: string | null; event: 'signed' | 'email_failed'; at: string | null; via: Via },
): Promise<ProcessOutcome> {
  const email = options.email?.trim().toLowerCase()
  const signer = email ? request.signers.find((item) => item.email.toLowerCase() === email) : null
  if (!signer) {
    return {
      status: 'ignored',
      reason: 'O aviso não diz de qual signatário é (ou não é de nenhum deste envio).',
      destinations: [],
    }
  }
  if (signer.status === 'signed') {
    return { status: 'duplicate', reason: 'Já estava como assinado.', destinations: [] }
  }

  if (options.event === 'signed') {
    await updateSigner(supabase, signer.id, {
      status: 'signed',
      signed_at: options.at ?? new Date().toISOString(),
    })
  } else {
    await updateSigner(supabase, signer.id, { status: 'email_failed' })
    await notifySignature(supabase, request, {
      kind: 'assinatura_email_falhou',
      title: 'E-mail de assinatura não entregue',
      body: `${signer.name} (${signer.email}) — ${request.title}. Corrija o e-mail na seção Assinatura.`,
      via: options.via,
    })
  }

  return {
    status: 'processed',
    reason: null,
    destinations: [{ table: 'signature_signers', id: signer.id, action: 'updated' }],
  }
}

/**
 * "Atualizar status": a fase na API e, enquanto não termina, quem já assinou.
 * Gasta uma ou duas chamadas — a tela segura o botão por alguns minutos.
 */
export async function syncRequest(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
): Promise<ProcessOutcome> {
  if (request.status !== 'sent' || !request.external_id) {
    return { status: 'ignored', reason: `O envio está "${request.status}".`, destinations: [] }
  }

  const phase = await getDocumentStatus(request.external_id)
  if (phase.statusId === D4SIGN_PHASES.finished) {
    return finishRequest(supabase, request, { signedAt: null, via: 'sync', confirmed: phase })
  }
  if (phase.statusId === D4SIGN_PHASES.canceled) {
    return cancelFromD4Sign(supabase, request, { reason: null, via: 'sync', confirmed: phase })
  }

  const listed = await listSigners(request.external_id)
  const destinations: WebhookEventDestination[] = []
  for (const signer of request.signers) {
    const match = listed.find((item) => item.email === signer.email.toLowerCase())
    if (!match) continue
    const patch: Parameters<typeof updateSigner>[2] = {}
    if (match.keySigner && !signer.key_signer) patch.key_signer = match.keySigner
    if (match.signed && signer.status !== 'signed') {
      patch.status = 'signed'
      patch.signed_at = new Date().toISOString()
    }
    if (Object.keys(patch).length === 0) continue
    await updateSigner(supabase, signer.id, patch)
    destinations.push({ table: 'signature_signers', id: signer.id, action: 'updated' })
  }

  const signed = request.signers.filter(
    (signer) => signer.status === 'signed' || listed.some((item) => item.signed && item.email === signer.email.toLowerCase()),
  ).length
  return {
    status: 'processed',
    reason: `Em ${phaseName(phase)}: ${signed} de ${request.signers.length} assinaram.`,
    destinations,
  }
}
