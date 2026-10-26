// Server-side. A chave de um signatário na D4Sign — o reenvio do link e a
// troca de e-mail pedem por ela.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SignatureRequestWithSigners, SignatureSigner } from '@/types/signature.types'
import { listSigners } from './documents'
import { updateSigner } from './requests'

/**
 * A chave guardada, ou a da lista de signatários da D4Sign (e aí guardada).
 * Null quando a D4Sign também não a mostra.
 */
export async function ensureKeySigner(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
  signer: SignatureSigner,
): Promise<string | null> {
  if (signer.key_signer) return signer.key_signer
  if (!request.external_id) return null

  const listed = await listSigners(request.external_id)
  const match = listed.find((item) => item.email === signer.email.toLowerCase())
  if (!match?.keySigner) return null

  await updateSigner(supabase, signer.id, { key_signer: match.keySigner })
  return match.keySigner
}
