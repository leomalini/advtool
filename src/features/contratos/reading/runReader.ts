import { generateText, Output, type FilePart, type LanguageModel, type TextPart } from 'ai'
import type { ManualFieldDefinition } from '@/features/documentos/templates/fieldSettings'
import {
  contractDataFromReader,
  mergeFieldSuggestions,
  mergePersons,
  summarizeDocuments,
} from './mergeReading'
import { buildReaderRequest, IMPORT_INSTRUCTIONS, READER_SYSTEM_PROMPT } from './readerPrompt'
import { readerOutputSchema, type ReaderOutput } from './readerSchema'
import type { ReaderResult } from './readerTypes'

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>

export interface RunReaderInput {
  model: LanguageModel
  providerOptions: ProviderOptions
  /** Os documentos já como o modelo os lê, com o cabeçalho "Documento N: …". */
  parts: Array<TextPart | FilePart>
  /** Na ordem dos cabeçalhos: o 1º é o "Documento 1". */
  documents: readonly { id: string; file_name: string }[]
  roles: readonly { key: string; label: string }[]
  manualFields: readonly Pick<ManualFieldDefinition, 'name' | 'label' | 'format'>[]
  importing: boolean
}

/**
 * Um pedido à IA para todos os documentos e a junção do resultado — SÓ
 * SERVIDOR. Sem banco aqui: quem chama lê os arquivos e completa com os
 * clientes já cadastrados (ver a rota). Isso deixa a peça cara — o pedido ao
 * provedor — testável sozinha.
 */
export async function runReader(input: RunReaderInput): Promise<Omit<ReaderResult, 'skipped'>> {
  const { output } = await generateText({
    model: input.model,
    system: input.importing
      ? `${READER_SYSTEM_PROMPT}\n\n${IMPORT_INSTRUCTIONS}`
      : READER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildReaderRequest({
              roles: input.roles,
              manualFields: input.manualFields,
              importing: input.importing,
              documentCount: input.documents.length,
            }),
          },
          ...input.parts,
        ],
      },
    ],
    output: Output.object({ schema: readerOutputSchema(input.importing) }),
    providerOptions: input.providerOptions,
    // Cada nova tentativa gasta cota; uma basta para um soluço de rede.
    maxRetries: 1,
  })

  const result = output as ReaderOutput
  const documentIdByIndex = new Map(input.documents.map((document, index) => [index + 1, document.id]))

  return {
    documents: summarizeDocuments(result, input.documents, documentIdByIndex),
    persons: mergePersons(
      result,
      documentIdByIndex,
      input.roles.map((role) => role.key),
    ),
    fieldSuggestions: mergeFieldSuggestions(result, documentIdByIndex, input.manualFields),
    contract: input.importing && result.contrato ? contractDataFromReader(result.contrato) : null,
  }
}
