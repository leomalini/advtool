// Server-side. O client é a service_role: `signature_requests` e
// `signature_signers` só aceitam escrita por ela (migration 79).
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SignatureRequest,
  SignatureRequestWithSigners,
  SignatureSigner,
} from '@/types/signature.types'

const REQUEST_SELECT = '*, signers:signature_signers(*)'

/** O envio com os signatários na ordem. */
export async function loadRequest(
  supabase: SupabaseClient,
  id: string,
): Promise<SignatureRequestWithSigners | null> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select(REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const request = data as SignatureRequestWithSigners
  return { ...request, signers: [...(request.signers ?? [])].sort((a, b) => a.position - b.position) }
}

export async function findRequestByExternalId(
  supabase: SupabaseClient,
  externalId: string,
): Promise<SignatureRequestWithSigners | null> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle()
  if (error) throw error
  return data ? loadRequest(supabase, data.id as string) : null
}

export async function updateRequest(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<SignatureRequest>,
): Promise<void> {
  const { error } = await supabase.from('signature_requests').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateSigner(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<SignatureSigner>,
): Promise<void> {
  const { error } = await supabase.from('signature_signers').update(patch).eq('id', id)
  if (error) throw error
}

// ── Avisos ──────────────────────────────────────────────────────────────────

export type SignatureNoticeKind =
  | 'assinatura_concluida'
  | 'assinatura_cancelada'
  | 'assinatura_email_falhou'

/**
 * Um aviso no sino. Só quem vê o módulo do envio recebe: o de contrato pede
 * `contratos`, o de documento, `documentos`. Falhar aqui não desfaz nada — o
 * fato já está gravado no envio.
 */
export async function notifySignature(
  supabase: SupabaseClient,
  request: Pick<SignatureRequest, 'id' | 'contract_id'>,
  input: { kind: SignatureNoticeKind; title: string; body: string; via: 'webhook' | 'sync' },
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    kind: input.kind,
    resource: request.contract_id ? 'contratos' : 'documentos',
    title: input.title,
    body: input.body,
    link: request.contract_id ? `/contratos/${request.contract_id}` : '/documentos',
    entity_type: request.contract_id ? 'contract' : 'signature_request',
    entity_id: request.contract_id ?? request.id,
    source: input.via,
  })
  if (error) console.error('[d4sign] aviso não gravado:', input.kind, error.message)
}
