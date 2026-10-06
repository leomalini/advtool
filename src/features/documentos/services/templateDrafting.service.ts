import { z } from 'zod'

export interface DraftTemplateTextsInput {
  templateId: string
  clientId: string | null
  processId: string | null
  /** O que quem gera sabe do caso — a principal fonte da redação. */
  notes: string
  /** Documentos do cliente/processo que a IA deve ler. */
  documentIds: string[]
  /** Campos de IA a redigir. */
  fields: string[]
}

export interface DraftTemplateTextsResult {
  texts: Record<string, string>
  /** Documentos que a IA não leu, com o motivo. */
  skipped: string[]
}

const responseSchema = z.object({
  texts: z.record(z.string(), z.string()),
  skipped: z.array(z.string()).default([]),
})
const errorSchema = z.object({ error: z.string() })

export class DraftingError extends Error {}

/** Pede à IA os textos dos campos de IA de um modelo (um pedido ao provedor). */
export async function draftTemplateTexts(
  input: DraftTemplateTextsInput,
): Promise<DraftTemplateTextsResult> {
  const response = await fetch('/api/documentos/modelos/redigir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = errorSchema.safeParse(body)
    throw new DraftingError(
      parsed.success ? parsed.data.error : 'A IA não conseguiu redigir agora.',
    )
  }
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) throw new DraftingError('Resposta inesperada da IA.')
  return parsed.data
}
