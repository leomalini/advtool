// Server-side. O porteiro das rotas que agem sobre um envio já criado.
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import type { SignatureRequestWithSigners } from '@/types/signature.types'
import { getD4SignConfig } from './config'
import { loadRequest } from './requests'

export type RequestGuardResult =
  | { ok: false; response: NextResponse }
  | {
      ok: true
      userId: string
      supabase: SupabaseClient
      request: SignatureRequestWithSigners
    }

/**
 * Carrega o envio e confere a permissão do módulo dele — `contratos:update`
 * para envio de contrato, `documentos:update` para o resto —, com o client de
 * sessão e a mesma `public.can()` das policies. Só então a rota usa a
 * service_role, como em `requireApiPermission`.
 */
export async function guardSignatureRequest(id: string): Promise<RequestGuardResult> {
  if (!hasServiceRoleKey() || !getD4SignConfig()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'A D4Sign não está configurada no servidor.' },
        { status: 503 },
      ),
    }
  }

  const supabase = createAdminClient()
  const request = await loadRequest(supabase, id)
  if (!request) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Envio não encontrado.' }, { status: 404 }),
    }
  }

  const guard = await requireApiPermission(request.contract_id ? 'contratos' : 'documentos', 'update')
  if (!guard.ok) return guard
  return { ok: true, userId: guard.userId, supabase, request }
}

/** Contrato que saiu para assinatura: `aguardando_assinatura`, pelo client de
 * sessão — o histórico registra quem enviou. Só a partir do rascunho. */
export async function markContractAwaitingSignature(
  session: SupabaseClient,
  contractId: string | null,
): Promise<void> {
  if (!contractId) return
  const { error } = await session
    .from('contracts')
    .update({ status: 'aguardando_assinatura' })
    .eq('id', contractId)
    .eq('status', 'rascunho')
  if (error) console.error('[d4sign] contrato não passou a aguardando:', contractId, error.message)
}
