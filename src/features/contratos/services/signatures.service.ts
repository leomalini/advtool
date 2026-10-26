import { createClient } from '@/lib/supabase/client'
import type { SendForSignatureInput } from '@/schemas/signature.schema'
import type { SignatureRequestWithSigners } from '@/types/signature.types'

const supabase = createClient()

const SIGNATURE_SELECT = '*, signers:signature_signers(*)'

function withSortedSigners(request: SignatureRequestWithSigners): SignatureRequestWithSigners {
  return {
    ...request,
    signers: [...(request.signers ?? [])].sort((a, b) => a.position - b.position),
  }
}

/** Os envios do contrato, do mais novo ao mais antigo. A tela só lê — quem
 * grava é o servidor (migration 79). */
export async function getContractSignatureRequests(
  contractId: string,
): Promise<SignatureRequestWithSigners[]> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select(SIGNATURE_SELECT)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as SignatureRequestWithSigners[]).map(withSortedSigners)
}

/** Erro de uma rota de assinatura, com o envio quando ele chegou a ser criado
 * (o passo que falhou aparece na seção, com "Tentar de novo"). */
export class SignatureRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly request: SignatureRequestWithSigners | null,
  ) {
    super(message)
    this.name = 'SignatureRouteError'
  }
}

async function callRoute<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = (await response.json().catch(() => null)) as
    | (T & { error?: string; request?: SignatureRequestWithSigners })
    | null
  if (!response.ok || !json) {
    throw new SignatureRouteError(json?.error ?? fallback, response.status, json?.request ?? null)
  }
  return json
}

export function sendForSignature(
  input: SendForSignatureInput,
): Promise<{ request: SignatureRequestWithSigners }> {
  return callRoute('/api/assinaturas', input, 'Não foi possível enviar para assinatura agora.')
}

export function retrySignature(id: string): Promise<{ request: SignatureRequestWithSigners }> {
  return callRoute(`/api/assinaturas/${id}/tentar`, {}, 'Não foi possível retomar o envio.')
}

export function cancelSignature(
  id: string,
  reason: string | null,
): Promise<{ request: SignatureRequestWithSigners }> {
  return callRoute(`/api/assinaturas/${id}/cancelar`, { reason }, 'Não foi possível cancelar o envio.')
}

export interface SignatureRefreshResult {
  outcome: { status: string; reason: string | null }
  request: SignatureRequestWithSigners
}

export function refreshSignature(id: string): Promise<SignatureRefreshResult> {
  return callRoute(`/api/assinaturas/${id}/atualizar`, {}, 'Não foi possível consultar a D4Sign.')
}

export function resendSignatureLink(id: string, signerId: string): Promise<{ ok: true }> {
  return callRoute(
    `/api/assinaturas/${id}/signatarios/${signerId}/reenviar`,
    {},
    'Não foi possível reenviar o link.',
  )
}

export function changeSignatureEmail(
  id: string,
  signerId: string,
  email: string,
): Promise<{ request: SignatureRequestWithSigners }> {
  return callRoute(
    `/api/assinaturas/${id}/signatarios/${signerId}/email`,
    { email },
    'Não foi possível trocar o e-mail.',
  )
}
