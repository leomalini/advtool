import { createClient } from '@/lib/supabase/client'
import type { SendForSignatureInput } from '@/schemas/signature.schema'
import type { DocumentRecord } from '@/types/document.types'
import type {
  SignatureRequestWithSigners,
  SignatureSealRow,
  SignerClient,
} from '@/types/signature.types'

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

/** Os envios de um arquivo avulso (Documentos), do mais novo ao mais antigo. */
export async function getDocumentSignatureRequests(
  documentId: string,
): Promise<SignatureRequestWithSigners[]> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select(SIGNATURE_SELECT)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as SignatureRequestWithSigners[]).map(withSortedSigners)
}

/**
 * Todos os envios visíveis, só o que o selo precisa. São poucos (o plano
 * manda 20 por mês) e a RLS já recorta pelo regime de cada arquivo. Consulta
 * à parte de `DOCUMENT_SELECT`: sem a migration 79, falha só o selo, não a
 * lista de documentos.
 */
export async function getSignatureSealRows(): Promise<SignatureSealRow[]> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select('id, document_id, signed_document_id, contract_id, status')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SignatureSealRow[]
}

/** Se a D4Sign está pronta no servidor. Na dúvida (erro, sem permissão), não. */
export async function getSignatureAvailability(): Promise<boolean> {
  const response = await fetch('/api/assinaturas/disponivel')
  if (!response.ok) return false
  const body = (await response.json().catch(() => null)) as { ready?: unknown } | null
  return body?.ready === true
}

const SIGNER_CLIENT_SELECT = 'id, type, name, company_name, trade_name, cpf, cnpj, email, phone'

/**
 * Quem costuma assinar um documento avulso: o cliente do próprio arquivo, o
 * do caso e os clientes que são parte do processo. Procuração e declaração não
 * levam a assinatura do advogado — ele entra só se incluído à mão.
 */
export async function getDocumentSignerClients(
  document: Pick<DocumentRecord, 'client_id' | 'crm_item_id' | 'legal_process_id'>,
): Promise<SignerClient[]> {
  const ids = new Set<string>()
  if (document.client_id) ids.add(document.client_id)

  if (document.crm_item_id) {
    const { data, error } = await supabase
      .from('crm_items')
      .select('client_id')
      .eq('id', document.crm_item_id)
      .maybeSingle()
    if (error) throw error
    if (data?.client_id) ids.add(data.client_id as string)
  }

  if (document.legal_process_id) {
    const { data, error } = await supabase
      .from('legal_process_parties')
      .select('client_id, client:clients(is_client)')
      .eq('legal_process_id', document.legal_process_id)
      .not('client_id', 'is', null)
      .order('position')
    if (error) throw error
    // A parte contrária pode estar cadastrada como pessoa: só quem é cliente.
    // Muitos-para-um: o embed vem como objeto, apesar do tipo inferido em lista.
    const parties = (data ?? []) as unknown as {
      client_id: string
      client: { is_client: boolean } | null
    }[]
    for (const party of parties) {
      if (party.client?.is_client) ids.add(party.client_id)
    }
  }

  if (ids.size === 0) return []
  const { data, error } = await supabase
    .from('clients')
    .select(SIGNER_CLIENT_SELECT)
    .in('id', [...ids])
  if (error) throw error
  const byId = new Map(((data ?? []) as SignerClient[]).map((client) => [client.id, client]))
  return [...ids].flatMap((id) => (byId.has(id) ? [byId.get(id) as SignerClient] : []))
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
