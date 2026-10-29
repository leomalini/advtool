import type { SignerInput } from '@/schemas/signature.schema'
import type { ContractParty, ContractWithRelations } from '@/types/contract.types'
import type { DocumentWithRelations } from '@/types/document.types'
import {
  SIGNABLE_FILE_TYPES,
  actForRole,
  type SignatureAct,
  type SignerAuthMethod,
  type SignerClient,
} from '@/types/signature.types'
import { toBrazilianE164 } from '@/utils/format'
import { getDisplayName } from '@/utils/profile'

/**
 * A lista de quem assina, como o envio para a D4Sign a monta: no diálogo da
 * tela (que deixa editar) e no Assistente (que envia a lista como ela nasce).
 * Um lugar só, para os dois mandarem as mesmas pessoas.
 */

/** Uma linha da lista de quem assina, como o formulário a edita. */
export interface SignerDraft {
  key: string
  /** O papel no contrato, para a pessoa se localizar. */
  roleLabel: string | null
  name: string
  email: string
  /** CPF ou CNPJ, só dígitos. */
  document: string
  /** Celular em E.164, quando a parte tem um válido. */
  phone: string | null
  whatsapp: boolean
  act: SignatureAct
  auth: SignerAuthMethod
  contractPartyId: string | null
  clientId: string | null
  /** Alguém do escritório: assina com o e-mail do login. */
  profileId: string | null
  office: boolean
}

/** Só os dígitos: CPF, CNPJ e celular vão sem máscara. */
export const onlyDigits = (value: string | null) => (value ?? '').replace(/\D/g, '')

/** As partes do contrato viram a lista inicial; a do escritório vira o
 * responsável pelo contrato, que pode ser trocado. */
export function signersFromParties(
  contract: ContractWithRelations,
  parties: ContractParty[],
): SignerDraft[] {
  return parties.map((party) => {
    const office = party.source === 'escritorio'
    return {
      key: party.id,
      roleLabel: party.role_label,
      name: office
        ? getDisplayName(contract.responsible?.full_name ?? party.name ?? 'Escritório')
        : (party.name ?? party.role_label),
      email: office ? '' : (party.email ?? ''),
      document: office ? '' : onlyDigits(party.document),
      phone: !office && party.phone ? toBrazilianE164(party.phone) : null,
      whatsapp: false,
      act: actForRole(party.role_key),
      auth: 'email',
      contractPartyId: party.id,
      clientId: office ? null : party.client_id,
      profileId: office ? contract.responsible_id : null,
      office,
    }
  })
}

/** O cliente do documento assina sozinho — procuração e declaração não levam
 * a assinatura do advogado. Empresa assina pela razão social. */
export function signerFromClient(client: SignerClient): SignerDraft {
  return {
    key: client.id,
    roleLabel: 'Cliente',
    name:
      (client.type === 'company' ? (client.company_name ?? client.trade_name) : client.name) ?? '',
    email: client.email ?? '',
    document: onlyDigits(client.type === 'company' ? client.cnpj : client.cpf),
    phone: client.phone ? toBrazilianE164(client.phone) : null,
    whatsapp: false,
    act: 1,
    auth: 'email',
    contractPartyId: null,
    clientId: client.id,
    profileId: null,
    office: false,
  }
}

/** Os arquivos que podem ir: PDF ou Word, a minuta mais nova primeiro. */
export function signableFiles(documents: DocumentWithRelations[]): DocumentWithRelations[] {
  return documents
    .filter((document) => SIGNABLE_FILE_TYPES.includes(document.file_type))
    .sort((a, b) => {
      const roleOrder =
        Number(b.contract_file_role === 'minuta') - Number(a.contract_file_role === 'minuta')
      return roleOrder !== 0 ? roleOrder : b.created_at.localeCompare(a.created_at)
    })
}

/** A lista como o pedido de envio a recebe (`sendForSignatureSchema`). Quem é
 * do escritório vai sem e-mail: o servidor usa o do login. */
export function toSignerInputs(signers: SignerDraft[]): SignerInput[] {
  return signers.map((signer) => ({
    name: signer.name,
    email: signer.office ? null : signer.email || null,
    document: signer.document || null,
    whatsapp: signer.whatsapp ? signer.phone : null,
    act: signer.act,
    auth: signer.auth,
    contractPartyId: signer.contractPartyId,
    clientId: signer.clientId,
    profileId: signer.office ? signer.profileId : null,
  }))
}
