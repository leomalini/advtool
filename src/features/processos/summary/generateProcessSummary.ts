import { generateText, Output, type LanguageModel } from 'ai'
import { buildSummaryInput, cleanCitations, type SummaryProcessData } from './summaryInput'
import { PROCESS_SUMMARY_SYSTEM_PROMPT } from './summaryPrompt'
import { processSummarySchema, type ProcessSummary, type SummarySource } from './summarySchema'

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>

export interface GeneratedSummary {
  summary: ProcessSummary
  sources: SummarySource[]
  /** O modelo que respondeu, como o provedor informou. */
  modelId: string
  /** O que `cleanCitations` tirou ou estranhou — vai para o log. */
  problems: string[]
}

/**
 * Um pedido ao modelo por processo, com saída estruturada — SÓ SERVIDOR. Sem
 * banco aqui: quem chama lê os dados (`loadSummaryData`) e grava o resultado.
 */
export async function generateProcessSummary(input: {
  model: LanguageModel
  providerOptions: ProviderOptions
  data: SummaryProcessData
  now: Date
}): Promise<GeneratedSummary> {
  const { text, sources } = buildSummaryInput(input.data, input.now)

  const result = await generateText({
    model: input.model,
    instructions: PROCESS_SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
    output: Output.object({ schema: processSummarySchema }),
    providerOptions: input.providerOptions,
    // Cada nova tentativa é cobrada; uma basta para um soluço de rede.
    maxRetries: 1,
  })

  const { summary, problems } = cleanCitations(result.output, sources)
  return { summary, sources, modelId: result.response.modelId, problems }
}
