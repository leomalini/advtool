import { createClient } from '@/lib/supabase/client'
import {
  getContractFilePaths,
  removeDocumentFiles,
  uploadDocument,
} from '@/features/documentos/services/documents.service'
import type { ContractInput, UpdateContractInput } from '@/schemas/contract.schema'
import type {
  Contract,
  ContractFileRole,
  ContractStatus,
  ContractStatusChange,
  ContractWithRelations,
} from '@/types/contract.types'
import type { DocumentCategory } from '@/types/document.types'

const supabase = createClient()

// `contracts` aponta duas vezes para `profiles` (responsável e autor): o embed
// precisa dizer por qual chave.
const CONTRACT_SELECT = `
  *,
  client:clients(id, type, name, company_name, trade_name),
  legal_process:legal_processes(id, cnj_number),
  responsible:profiles!contracts_responsible_id_fkey(id, full_name),
  documents(id, contract_file_role)
`

/** Controles de formulário devolvem '' quando intocados; Postgres rejeita isso
 * em colunas uuid/date. Mesmo tratamento de financialEntries.service. */
function nullifyEmpty<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = value === '' ? null : value
  }
  return out as T
}

export async function getContracts(): Promise<ContractWithRelations[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as ContractWithRelations[]
}

export async function getContractById(id: string): Promise<ContractWithRelations | null> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as unknown as ContractWithRelations | null
}

export async function getContractStatusChanges(
  contractId: string
): Promise<ContractStatusChange[]> {
  const { data, error } = await supabase
    .from('contract_status_changes')
    .select('*, changer:profiles!contract_status_changes_changed_by_fkey(id, full_name)')
    .eq('contract_id', contractId)
    .order('changed_at', { ascending: true })

  if (error) throw error
  return data as unknown as ContractStatusChange[]
}

export async function createContract(input: ContractInput, userId: string): Promise<Contract> {
  const { data, error } = await supabase
    .from('contracts')
    .insert({ ...nullifyEmpty(input), created_by: userId })
    .select('*')
    .single()

  if (error) throw error
  return data as Contract
}

export async function updateContract(input: UpdateContractInput): Promise<void> {
  const { id, ...rest } = input
  const { error } = await supabase.from('contracts').update(nullifyEmpty(rest)).eq('id', id)
  if (error) throw error
}

/**
 * Muda o status. O histórico é gravado pelo trigger da migration 69.
 *
 * `signedAt` só vale para a assinatura: é a data em que o contrato foi
 * assinado, que pode não ser a do clique.
 */
export async function changeContractStatus(
  id: string,
  status: ContractStatus,
  signedAt?: string | null
): Promise<void> {
  const patch: Partial<Contract> = { status }
  if (status === 'vigente' && signedAt) patch.signed_at = signedAt

  const { data, error } = await supabase
    .from('contracts')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) throw error
  // RLS negando não gera erro, só "0 linhas".
  if (data.length === 0) throw new Error('Sem permissão para mudar este contrato.')
}

/** Guarda o modelo usado na última minuta gerada. */
export async function setContractTemplate(id: string, templateId: string): Promise<void> {
  const { error } = await supabase.from('contracts').update({ template_id: templateId }).eq('id', id)
  if (error) throw error
}

/** A minuta e a versão assinada são o contrato; um anexo pode ser qualquer
 * coisa (documento da parte, comprovante). */
export function contractFileCategory(role: ContractFileRole): DocumentCategory {
  return role === 'anexo' ? 'outros' : 'contrato'
}

/** Sobe um arquivo do contrato. Mesmo caminho dos demais documentos — a RLS
 * exige `contratos:update` (migration 69). */
export async function uploadContractFile(
  contractId: string,
  role: ContractFileRole,
  file: File,
  userId: string
): Promise<void> {
  await uploadDocument(
    {
      category: contractFileCategory(role),
      contract_id: contractId,
      contract_file_role: role,
    },
    file,
    userId
  )
}

/**
 * Exclui o contrato e os arquivos dele.
 *
 * As linhas saem pelo cascade (migration 69); os objetos do bucket, não. Por
 * isso os caminhos são lidos antes — e os arquivos só saem se o contrato saiu
 * mesmo. Mesmo desenho de deleteFinancialEntry.
 */
export async function deleteContract(id: string): Promise<void> {
  const filePaths = await getContractFilePaths(id)

  const { data, error } = await supabase.from('contracts').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Sem permissão para excluir este contrato.')

  await removeDocumentFiles(filePaths)
}
