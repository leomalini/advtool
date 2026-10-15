import { getClientById } from '@/features/clientes/services/clientes.service'
import { deleteDocument } from '@/features/documentos/services/documents.service'
import type { ContractTemplateValues } from '@/types/contract.types'
import type { DocumentWithRelations } from '@/types/document.types'
import { toManualRawValue } from '../reading/mergeReading'
import type { ReaderMode, ReaderResult } from '../reading/readerTypes'
import { chosenPersonData, fillFromReading, type ReviewState } from '../reading/reviewState'
import { personFromClient } from '../utils/partyData'
import {
  createContractParties,
  linkDocumentToParty,
  saveContractTemplateValues,
  type NewContractParty,
} from './contractParties.service'

/** Mensagem de erro da rota, para o toast. */
export class ReaderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ReaderRequestError'
  }
}

/** POST /api/contratos/ler-documentos — um pedido à IA, nada gravado. */
export async function readContractDocuments(input: {
  contractId: string
  documentIds: string[]
  mode: ReaderMode
}): Promise<ReaderResult> {
  const response = await fetch('/api/contratos/ler-documentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await response.json().catch(() => null)) as
    | (ReaderResult & { error?: undefined })
    | { error: string }
    | null
  if (!response.ok || !body || 'error' in body) {
    const message = body && 'error' in body && body.error ? body.error : 'Não foi possível ler.'
    throw new ReaderRequestError(message, response.status)
  }
  return body
}

/**
 * Grava o que foi conferido: as partes, a ligação de cada documento à sua
 * parte, os documentos descartados e as sugestões para os campos do modelo.
 *
 * Os documentos já estão no contrato (subiram antes da leitura); "não
 * guardar" os apaga agora.
 */
export async function applyReading({
  contractId,
  result,
  review,
  documents,
  templateId,
  savedValues,
  contractDocumentId,
}: {
  contractId: string
  result: ReaderResult
  review: ReviewState
  documents: readonly Pick<DocumentWithRelations, 'id' | 'file_path'>[]
  templateId: string | null
  savedValues: ContractTemplateValues
  /** Importação: o arquivo do próprio contrato — é do contrato, nunca de uma
   * parte, mesmo que só uma tenha sido lida. */
  contractDocumentId?: string
}): Promise<{ parties: number }> {
  const included = result.persons.filter((person) => {
    const decision = review.persons[person.key]
    return decision?.include && decision.role?.key
  })

  const newParties: NewContractParty[] = []
  for (const person of included) {
    const decision = review.persons[person.key]
    const read = chosenPersonData(person, decision)
    if (person.clientMatch && decision.useClient) {
      const client = await getClientById(person.clientMatch.id)
      const filled = fillFromReading(personFromClient(client), read)
      newParties.push({
        role_key: decision.role!.key,
        role_label: decision.role!.label,
        source: 'cliente',
        client_id: client.id,
        person: filled.person,
        field_sources: filled.sources,
      })
    } else {
      newParties.push({
        role_key: decision.role!.key,
        role_label: decision.role!.label,
        source: 'documentos',
        client_id: null,
        person: read.person,
        field_sources: read.sources,
      })
    }
  }
  // A ordem de inserção é a de `position` — a do retorno do banco, não
  // necessariamente.
  const created = [...(await createContractParties(contractId, newParties))].sort(
    (a, b) => a.position - b.position,
  )

  // Documento de uma pessoa só fica ligado a ela; de mais de uma (certidão
  // de casamento), fica do contrato.
  for (const summary of result.documents) {
    if (!review.keepDocuments[summary.id] && summary.id !== contractDocumentId) continue
    const owners = included
      .map((person, index) => (person.documentIds.includes(summary.id) ? created[index] : null))
      .filter((party): party is NonNullable<typeof party> => !!party)
    const isContract = summary.id === contractDocumentId
    await linkDocumentToParty(summary.id, {
      partyId: owners.length === 1 && !isContract ? owners[0].id : null,
      sourceKind: isContract ? 'contrato' : summary.kind,
    })
  }

  for (const summary of result.documents) {
    if (review.keepDocuments[summary.id] || summary.id === contractDocumentId) continue
    const document = documents.find((item) => item.id === summary.id)
    if (document) await deleteDocument(document.id, document.file_path)
  }

  const chosenSuggestions = result.fieldSuggestions.filter(
    (suggestion) => review.suggestions[suggestion.field]?.use,
  )
  if (templateId && chosenSuggestions.length > 0) {
    // Os valores entram como se tivessem sido digitados na última minuta —
    // a tela de geração abre com eles, marcados com a origem.
    const base = savedValues.templateId === templateId ? savedValues : { templateId }
    const manual = { ...(base.manual ?? {}) }
    const manualSources = { ...(base.manualSources ?? {}) }
    for (const suggestion of chosenSuggestions) {
      const option =
        suggestion.options[review.suggestions[suggestion.field].option] ?? suggestion.options[0]
      manual[suggestion.field] = toManualRawValue(suggestion.format, option.value)
      if (option.sources[0]) manualSources[suggestion.field] = option.sources[0]
    }
    await saveContractTemplateValues(contractId, { ...base, templateId, manual, manualSources })
  }

  return { parties: created.length }
}
