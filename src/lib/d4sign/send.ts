// Server-side. O envio para assinatura, passo a passo, gravando o progresso no
// próprio envio — "Tentar de novo" continua do passo que falhou, sem subir o
// arquivo outra vez.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getClientDisplayName } from '@/types/cliente.types'
import {
  SIGNATURE_STEPS,
  type SignatureRequestWithSigners,
  type SignatureStep,
  type SignerAuthMethod,
} from '@/types/signature.types'
import { registerDocumentWebhook } from './account'
import { D4SignApiError, redactD4SignSecrets } from './client'
import { d4signWebhookSecret } from './config'
import {
  findListedSigners,
  registerSigners,
  sendToSigners,
  signerParams,
  uploadToSafe,
} from './documents'
import { ensureFolder, type FolderOwner } from './folders'
import { loadRequest, updateRequest, updateSigner } from './requests'
import { loadOriginalDocument, readStoredFile } from './storage'
import { d4signWebhookEndpoint } from './urls'

export interface RunResult {
  ok: boolean
  /** Por que parou — a frase que a tela mostra. */
  error: string | null
  failedStep: SignatureStep | null
}

/** De quem é a pasta do envio no cofre. */
async function folderOwner(
  supabase: SupabaseClient,
  request: SignatureRequestWithSigners,
): Promise<FolderOwner> {
  if (request.client_id) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, type, name, company_name, trade_name')
      .eq('id', request.client_id)
      .maybeSingle()
    if (error) throw error
    if (data) {
      return {
        kind: 'cliente',
        clientId: request.client_id,
        clientName: getClientDisplayName(data as Parameters<typeof getClientDisplayName>[0]),
      }
    }
  }

  if (request.contract_id) {
    const { data } = await supabase
      .from('contracts')
      .select('kind')
      .eq('id', request.contract_id)
      .maybeSingle()
    if (data?.kind === 'escritorio') return { kind: 'escritorio' }
  }
  return { kind: 'sem_cliente' }
}

/** O que a D4Sign devolveu de cada signatário, só os valores simples — sem o
 * `sign_info` (IP, local) que a lista traz depois da assinatura. */
function flatValues(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value),
    ),
  )
}

type StepRunner = (supabase: SupabaseClient, request: SignatureRequestWithSigners) => Promise<void>

const STEPS: Record<SignatureStep, StepRunner> = {
  async folder(supabase, request) {
    if (!request.safe_uuid) throw new Error('O envio não tem cofre.')
    const folderUuid = await ensureFolder(
      supabase,
      request.safe_uuid,
      await folderOwner(supabase, request),
    )
    await updateRequest(supabase, request.id, { folder_uuid: folderUuid })
    request.folder_uuid = folderUuid
  },

  async upload(supabase, request) {
    if (request.external_id) return
    const original = await loadOriginalDocument(supabase, request.document_id)
    if (!original) throw new Error('O arquivo do envio foi excluído.')

    const bytes = await readStoredFile(supabase, original.file_path)
    const externalId = await uploadToSafe(request.safe_uuid as string, request.folder_uuid, {
      bytes,
      name: original.file_name,
      type: original.file_type,
    })
    await updateRequest(supabase, request.id, { external_id: externalId })
    request.external_id = externalId
  },

  // Sem endereço público ou sem a Secret Key MAC, segue sem avisos: o status
  // passa a depender do "Atualizar status".
  async webhook(_supabase, request) {
    const endpoint = d4signWebhookEndpoint()
    if (!endpoint || !d4signWebhookSecret()) return
    await registerDocumentWebhook(request.external_id as string, endpoint)
  },

  async signers(supabase, request) {
    const body = await registerSigners(
      request.external_id as string,
      request.signers.map((signer) =>
        signerParams({
          email: signer.email,
          name: signer.name,
          document: signer.document,
          whatsapp: signer.whatsapp_number,
          act: signer.act,
          auth: (signer.auth_requested.method ?? 'email') as SignerAuthMethod,
        }),
      ),
    )

    // A resposta não é documentada: se trouxer a chave de cada um, guarda.
    const listed = findListedSigners(body)
    for (const signer of request.signers) {
      const match = listed.find((item) => item.email === signer.email.toLowerCase())
      if (!match) continue
      await updateSigner(supabase, signer.id, {
        key_signer: match.keySigner ?? signer.key_signer,
        auth_applied: flatValues(match.raw),
      })
    }
  },

  async send(_supabase, request) {
    await sendToSigners(request.external_id as string, {
      ordered: request.ordered,
      message: request.message,
      deadline: request.deadline,
    })
  },
}

function errorMessage(error: unknown): string {
  if (error instanceof D4SignApiError) return error.message
  if (error instanceof Error) return redactD4SignSecrets(error.message)
  return 'Falha inesperada no envio.'
}

/**
 * Roda os passos que faltam. Envio novo começa da pasta; envio que falhou
 * continua do passo dele. Ao fim, o envio está `sent` ou `failed` — nunca
 * parado em `preparing`.
 */
export async function runSignatureRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RunResult> {
  const request = await loadRequest(supabase, requestId)
  if (!request) return { ok: false, error: 'Envio não encontrado.', failedStep: null }
  if (request.status === 'sent') return { ok: true, error: null, failedStep: null }
  if (request.status !== 'preparing' && request.status !== 'failed') {
    return { ok: false, error: 'Este envio já terminou.', failedStep: null }
  }

  const start = request.failed_step ? SIGNATURE_STEPS.indexOf(request.failed_step) : 0
  try {
    await updateRequest(supabase, request.id, { status: 'preparing', failed_step: null, error: null })
  } catch (error) {
    // O índice de um envio aberto por arquivo (migration 79): saiu outro
    // envio deste arquivo depois que este falhou.
    if ((error as { code?: string }).code !== '23505') throw error
    return {
      ok: false,
      error: 'Já há outro envio deste arquivo em andamento: cancele este.',
      failedStep: request.failed_step,
    }
  }

  let current: SignatureStep = SIGNATURE_STEPS[start]
  try {
    for (const step of SIGNATURE_STEPS.slice(start)) {
      current = step
      await STEPS[step](supabase, request)
    }
    await updateRequest(supabase, request.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    return { ok: true, error: null, failedStep: null }
  } catch (error) {
    const message = errorMessage(error)
    console.error('[d4sign] envio parou em', current, request.id, message)
    await updateRequest(supabase, request.id, {
      status: 'failed',
      failed_step: current,
      error: message,
    })
    return { ok: false, error: message, failedStep: current }
  }
}
