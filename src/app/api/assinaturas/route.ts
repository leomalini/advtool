import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getD4SignConfig } from '@/lib/d4sign/config'
import { loadRequest } from '@/lib/d4sign/requests'
import { markContractAwaitingSignature } from '@/lib/d4sign/routeGuard'
import { runSignatureRequest } from '@/lib/d4sign/send'
import {
  sendForSignatureSchema,
  type SendForSignatureInput,
  type SignerInput,
} from '@/schemas/signature.schema'
import type { D4SignFeatures } from '@/types/d4sign.types'
import { AUTH_METHOD_FEATURE, SIGNABLE_FILE_TYPES } from '@/types/signature.types'

/** Subir o arquivo e os quatro passos seguintes, numa rede lenta. */
export const maxDuration = 120

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

/** Recurso do plano desligado não passa, mesmo que a tela o ofereça. */
function featureProblem(signers: SignerInput[], features: D4SignFeatures): string | null {
  for (const signer of signers) {
    if (signer.auth !== 'email' && features[AUTH_METHOD_FEATURE[signer.auth]] !== true) {
      return `O plano não tem a autenticação escolhida para ${signer.name} (Configurações → Assinatura).`
    }
    if (signer.whatsapp && features.whatsapp !== true) {
      return 'O envio pelo WhatsApp está desligado em Configurações → Assinatura.'
    }
  }
  return null
}

/** O que o envio grava de onde o arquivo mora. */
interface SendTarget {
  document: { id: string; file_name: string; file_type: string }
  /** Contrato que vai a "aguardando assinatura" quando o envio sai. */
  contractId: string | null
  /** Dono da pasta no cofre (e, na fase 4, de quem o portal mostra). */
  clientId: string | null
}

type TargetResult = { ok: true; target: SendTarget } | { ok: false; response: NextResponse }

function notFound(error: string): TargetResult {
  return { ok: false, response: NextResponse.json({ error }, { status: 404 }) }
}

/**
 * O arquivo e o regime dele. Arquivo de contrato só sai pelo contrato — é lá
 * que o status muda e a cópia assinada entra; anexo de lançamento não sai.
 * Documento avulso fica com o cliente do próprio arquivo, do caso ou, por
 * último, do primeiro signatário que é cliente (o caso do processo).
 */
async function resolveTarget(
  supabase: SupabaseClient,
  input: SendForSignatureInput,
): Promise<TargetResult> {
  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id, contract_id, financial_entry_id, client_id, crm_item_id, file_name, file_type')
    .eq('id', input.documentId)
    .maybeSingle()
  if (documentError) throw documentError

  if (input.contractId) {
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, client_id')
      .eq('id', input.contractId)
      .maybeSingle()
    if (contractError) throw contractError
    if (!contract) return notFound('Contrato não encontrado.')
    if (!document || document.contract_id !== contract.id) {
      return { ok: false, response: badRequest('O arquivo escolhido não é deste contrato.') }
    }
    return {
      ok: true,
      target: {
        document,
        contractId: contract.id as string,
        clientId: (contract.client_id as string | null) ?? null,
      },
    }
  }

  if (!document) return notFound('Documento não encontrado.')
  if (document.contract_id) {
    return { ok: false, response: badRequest('Arquivo de contrato: envie pela página do contrato.') }
  }
  if (document.financial_entry_id) {
    return { ok: false, response: badRequest('Anexo de lançamento não vai para assinatura.') }
  }

  let clientId = (document.client_id as string | null) ?? null
  if (!clientId && document.crm_item_id) {
    const { data: crmItem } = await supabase
      .from('crm_items')
      .select('client_id')
      .eq('id', document.crm_item_id)
      .maybeSingle()
    clientId = (crmItem?.client_id as string | null) ?? null
  }
  clientId ??= input.signers.find((signer) => signer.clientId)?.clientId ?? null
  return { ok: true, target: { document, contractId: null, clientId } }
}

/**
 * POST /api/assinaturas — manda um arquivo para assinatura na D4Sign: um
 * arquivo de contrato (`contractId`) ou um documento avulso — procuração,
 * declaração — de cliente, caso, processo ou evento.
 *
 * Confere a permissão do alvo antes de qualquer chamada (o envio gasta cota):
 * `contratos:update` para contrato, `documentos:update` para o resto. Grava o
 * envio e os signatários e roda os passos (`lib/d4sign/send.ts`). Se um passo
 * falha, o envio fica `failed` e a resposta é 502 com o motivo — a tela mostra
 * o envio com "Tentar de novo". Deu certo e é contrato: ele vai para
 * "aguardando assinatura" pelo client de sessão, com o autor no histórico.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  // O alvo do pedido decide quem pode; o arquivo confirma o alvo adiante.
  const forContract =
    typeof body === 'object' && body !== null && !!(body as { contractId?: unknown }).contractId
  const guard = await requireApiPermission(forContract ? 'contratos' : 'documentos', 'update')
  if (!guard.ok) return guard.response

  if (!hasServiceRoleKey() || !getD4SignConfig()) {
    return NextResponse.json(
      { error: 'A D4Sign não está configurada no servidor.' },
      { status: 503 },
    )
  }

  const parsed = sendForSignatureSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Pedido inválido.')
  const input = parsed.data
  const supabase = createAdminClient()

  const resolved = await resolveTarget(supabase, input)
  if (!resolved.ok) return resolved.response
  const { document, contractId, clientId } = resolved.target
  if (!SIGNABLE_FILE_TYPES.includes(document.file_type)) {
    return badRequest(
      contractId
        ? 'A D4Sign recebe PDF ou Word. Gere a minuta ou anexe o PDF antes.'
        : 'A D4Sign recebe PDF ou Word.',
    )
  }

  // O índice único cobre o envio aberto; o que falhou num passo também segura
  // o arquivo — senão o "Tentar de novo" dele bateria no envio novo.
  const { data: stalled, error: stalledError } = await supabase
    .from('signature_requests')
    .select('id')
    .eq('document_id', document.id)
    .eq('status', 'failed')
    .limit(1)
  if (stalledError) throw stalledError
  if (stalled.length > 0) {
    return NextResponse.json(
      { error: 'Um envio deste arquivo parou num passo: tente de novo ou cancele antes.' },
      { status: 409 },
    )
  }

  const { data: settings } = await supabase.from('office_settings').select('*').maybeSingle()
  const problem = featureProblem(input.signers, (settings?.d4sign_features ?? {}) as D4SignFeatures)
  if (problem) return badRequest(problem)

  // Quem assina pelo escritório vai com o e-mail do login.
  const signers: (SignerInput & { email: string })[] = []
  for (const signer of input.signers) {
    let email = signer.email
    if (!email && signer.profileId) {
      const { data } = await supabase.auth.admin.getUserById(signer.profileId)
      email = data.user?.email?.toLowerCase() ?? null
    }
    if (!email) return badRequest(`Sem e-mail para ${signer.name}.`)
    signers.push({ ...signer, email })
  }
  if (new Set(signers.map((signer) => signer.email)).size !== signers.length) {
    return badRequest('A mesma pessoa (e-mail) aparece duas vezes.')
  }

  const { data: created, error: insertError } = await supabase
    .from('signature_requests')
    .insert({
      contract_id: contractId,
      client_id: clientId,
      document_id: document.id,
      safe_uuid: input.safe.uuid,
      title: document.file_name,
      ordered: input.ordered,
      message: input.message,
      deadline: input.deadline,
      created_by: guard.userId,
    })
    .select('id')
    .single()
  if (insertError) {
    // O índice único parcial: um envio aberto por arquivo (migration 79).
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Este arquivo já está em assinatura.' }, { status: 409 })
    }
    throw insertError
  }
  const requestId = created.id as string

  const { error: signersError } = await supabase.from('signature_signers').insert(
    signers.map((signer, index) => ({
      request_id: requestId,
      position: index + 1,
      name: signer.name,
      email: signer.email,
      document: signer.document,
      whatsapp_number: signer.whatsapp,
      act: signer.act,
      contract_party_id: signer.contractPartyId,
      client_id: signer.clientId,
      profile_id: signer.profileId,
      auth_requested: { method: signer.auth },
    })),
  )
  if (signersError) {
    await supabase.from('signature_requests').delete().eq('id', requestId)
    throw signersError
  }

  // O e-mail digitado no envio completa a parte do contrato que não tinha. O
  // cadastro do cliente não muda por aqui: é outra permissão.
  for (const signer of signers) {
    if (!contractId || !signer.contractPartyId || signer.profileId) continue
    await supabase
      .from('contract_parties')
      .update({ email: signer.email })
      .eq('id', signer.contractPartyId)
      .is('email', null)
  }

  const run = await runSignatureRequest(supabase, requestId)
  if (run.ok) await markContractAwaitingSignature(await createClient(), contractId)

  const saved = await loadRequest(supabase, requestId)
  return NextResponse.json(
    run.ok ? { request: saved } : { request: saved, error: run.error },
    { status: run.ok ? 200 : 502 },
  )
}
