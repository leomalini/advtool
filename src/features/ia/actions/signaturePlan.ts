import { getDocumentSignerClients } from '@/features/assinaturas/services/signatures.service'
import {
  signerFromClient,
  signersFromParties,
  toSignerInputs,
  type SignerDraft,
} from '@/features/assinaturas/utils/signerDrafts'
import { getOfficeSettings } from '@/features/configuracoes/services/officeSettings.service'
import { getContractParties } from '@/features/contratos/services/contractParties.service'
import { getContractById } from '@/features/contratos/services/contracts.service'
import { getDocumentRecord } from '@/features/documentos/services/documents.service'
import { resolveSafe, safeRouteForContract, safeRouteForDocument } from '@/lib/d4sign/safeRoutes'
import { sendForSignatureSchema, type SendForSignatureInput } from '@/schemas/signature.schema'
import type { D4SignSafeRoute } from '@/types/d4sign.types'
import { SIGNABLE_FILE_TYPES } from '@/types/signature.types'

/**
 * O envio para assinatura que o Assistente propõe, montado como o diálogo da
 * tela monta a lista inicial: as partes do contrato, ou o cliente do
 * documento avulso, e o cofre do tipo. A IA escolhe só o arquivo — quem
 * assina e os e-mails vêm do cadastro, nunca do modelo.
 *
 * O card chama para mostrar a lista; o executor chama de novo na confirmação,
 * para enviar o que está no banco naquele momento.
 */
export interface SignaturePlan {
  documentName: string | null
  safeName: string | null
  signers: SignerDraft[]
  request: { ok: true; input: SendForSignatureInput } | { ok: false; reason: string }
}

export interface SignaturePlanParams {
  documentId: string
  contractId: string | null
  message: string | null
  deadline: string | null
}

function refuse(reason: string, partial: Partial<SignaturePlan> = {}): SignaturePlan {
  return {
    documentName: null,
    safeName: null,
    signers: [],
    ...partial,
    request: { ok: false, reason },
  }
}

/** Hoje no fuso do escritório, para comparar com o prazo (yyyy-MM-dd). */
function officeToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function planSignature(params: SignaturePlanParams): Promise<SignaturePlan> {
  const document = await getDocumentRecord(params.documentId)
  if (!document) return refuse('arquivo não encontrado ou sem acesso')
  const documentName = document.file_name

  if (!SIGNABLE_FILE_TYPES.includes(document.file_type)) {
    return refuse('só PDF ou Word vão para assinatura', { documentName })
  }

  let route: D4SignSafeRoute
  let signers: SignerDraft[]
  if (params.contractId) {
    const [contract, parties] = await Promise.all([
      getContractById(params.contractId),
      getContractParties(params.contractId),
    ])
    if (!contract) return refuse('contrato não encontrado ou sem acesso', { documentName })
    if (document.contract_id !== contract.id) {
      return refuse('o arquivo escolhido não é deste contrato', { documentName })
    }
    route = safeRouteForContract(contract.kind)
    signers = signersFromParties(contract, parties)
  } else {
    // Os mesmos regimes da rota: arquivo de contrato sai pelo contrato, anexo
    // de lançamento não sai.
    if (document.contract_id) {
      return refuse('arquivo de contrato vai pelo contrato (informe o contrato)', { documentName })
    }
    if (document.financial_entry_id) {
      return refuse('anexo de lançamento não vai para assinatura', { documentName })
    }
    route = safeRouteForDocument(document.category)
    signers = (await getDocumentSignerClients(document)).map(signerFromClient)
  }

  const settings = await getOfficeSettings()
  const safe = resolveSafe(settings?.d4sign_safes ?? {}, route)
  const partial = { documentName, safeName: safe?.name ?? null, signers }

  if (!safe) {
    return refuse('não há cofre da D4Sign para este tipo (Configurações → Assinatura)', partial)
  }
  if (signers.length === 0) {
    return refuse('ninguém para assinar no cadastro — envie pela tela', partial)
  }
  const withoutEmail = signers.find((signer) => !signer.office && !signer.email.trim())
  if (withoutEmail) {
    return refuse(`${withoutEmail.name || 'uma das pessoas'} está sem e-mail no cadastro`, partial)
  }
  if (params.deadline && params.deadline <= officeToday()) {
    return refuse('o prazo para assinar precisa ser a partir de amanhã', partial)
  }

  const parsed = sendForSignatureSchema.safeParse({
    contractId: params.contractId,
    documentId: params.documentId,
    safe,
    signers: toSignerInputs(signers),
    ordered: false,
    message: params.message,
    deadline: params.deadline,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const index = issue?.path[0] === 'signers' ? issue.path[1] : null
    const who = typeof index === 'number' ? signers[index]?.name : null
    const message = issue?.message ?? 'dados do envio incompletos'
    return refuse(who ? `${who}: ${message}` : message, partial)
  }

  return { ...partial, request: { ok: true, input: parsed.data } }
}
