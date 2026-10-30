import { createClient } from '@/lib/supabase/client'
import type {
  ContractParty,
  ContractPartySource,
  ContractTemplateValues,
  PartyFieldSources,
  PartyPersonData,
} from '@/types/contract.types'
import type { DocumentCategory } from '@/types/document.types'

const supabase = createClient()

export async function getContractParties(contractId: string): Promise<ContractParty[]> {
  // `is_client` do cadastro ligado: a tela diz "cliente" ou "pessoa" e leva à
  // ficha certa (migration 78).
  const { data, error } = await supabase
    .from('contract_parties')
    .select('*, client:clients(is_client)')
    .eq('contract_id', contractId)
    .order('position')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as ContractParty[]
}

export interface NewContractParty {
  role_key: string
  role_label: string
  source: ContractPartySource
  client_id?: string | null
  person: PartyPersonData
  field_sources?: PartyFieldSources
}

/** Próxima posição livre — a ordem em que as partes entram no documento. */
async function nextPosition(contractId: string): Promise<number> {
  const { data, error } = await supabase
    .from('contract_parties')
    .select('position')
    .eq('contract_id', contractId)
    .order('position', { ascending: false })
    .limit(1)
  if (error) throw error
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1
}

export async function createContractParties(
  contractId: string,
  parties: NewContractParty[],
): Promise<ContractParty[]> {
  if (parties.length === 0) return []
  const start = await nextPosition(contractId)
  const { data, error } = await supabase
    .from('contract_parties')
    .insert(
      parties.map((party, index) => ({
        contract_id: contractId,
        position: start + index,
        role_key: party.role_key,
        role_label: party.role_label,
        source: party.source,
        client_id: party.client_id ?? null,
        field_sources: party.field_sources ?? {},
        ...party.person,
      })),
    )
    .select('*')

  if (error) throw error
  return (data ?? []) as ContractParty[]
}

export async function updateContractParty(
  id: string,
  patch: Partial<PartyPersonData> &
    Partial<Pick<ContractParty, 'role_key' | 'role_label' | 'source' | 'client_id' | 'field_sources'>>,
): Promise<void> {
  const { data, error } = await supabase
    .from('contract_parties')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  // RLS negando não gera erro, só "0 linhas".
  if (data.length === 0) throw new Error('Sem permissão para mudar esta parte.')
}

export async function deleteContractParty(id: string): Promise<void> {
  const { data, error } = await supabase.from('contract_parties').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Sem permissão para tirar esta parte.')
}

/** Guarda o que foi preenchido na minuta — "Gerar nova versão" reabre com isso. */
export async function saveContractTemplateValues(
  contractId: string,
  values: ContractTemplateValues,
): Promise<void> {
  const { error } = await supabase
    .from('contracts')
    .update({ template_values: values })
    .eq('id', contractId)
  if (error) throw error
}

/** A categoria que o tipo reconhecido pelo leitor indica — a mesma tabela da
 * migration 87. */
const SOURCE_KIND_CATEGORY: Partial<Record<string, DocumentCategory>> = {
  cnh: 'identificacao',
  rg: 'identificacao',
  cpf: 'identificacao',
  certidao_nascimento: 'certidao',
  certidao_casamento: 'certidao',
  comprovante_residencia: 'comprovante_residencia',
  procuracao: 'procuracao',
  nota_fiscal: 'nota_fiscal',
  contrato: 'contrato',
}

/** Liga um documento lido à parte de quem ele é, com o tipo reconhecido. */
export async function linkDocumentToParty(
  documentId: string,
  link: { partyId: string | null; sourceKind: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ contract_party_id: link.partyId, source_kind: link.sourceKind })
    .eq('id', documentId)
  if (error) throw error

  // Só o que ainda está em "Outros": quem já escolheu a categoria à mão manda.
  const category = link.sourceKind ? SOURCE_KIND_CATEGORY[link.sourceKind] : undefined
  if (!category) return
  const { error: categoryError } = await supabase
    .from('documents')
    .update({ category })
    .eq('id', documentId)
    .eq('category', 'outros')
  if (categoryError) throw categoryError
}
