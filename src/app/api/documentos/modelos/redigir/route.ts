import { NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createAssistantModel } from '@/features/ia/model'
import { isProviderQuotaError } from '@/features/ia/providerErrors'
import {
  DRAFT_MAX_DOCUMENTS,
  DRAFT_MAX_FIELDS,
  DRAFT_MAX_NOTES,
  DRAFTING_SYSTEM_PROMPT,
  draftingOutputSchema,
} from '@/features/documentos/templates/drafting'
import { buildDraftingMessage } from '@/features/documentos/templates/draftingContext'
import { classifyTemplateFields } from '@/features/documentos/templates/fieldSettings'
import { parseFieldSettings } from '@/schemas/documentTemplate.schema'
import type { DocumentTemplate } from '@/types/documentTemplate.types'

/** Segundos. Uma redação com dois ou três PDFs passa fácil de meio minuto. */
export const maxDuration = 120

const bodySchema = z.object({
  templateId: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  processId: z.string().uuid().nullable(),
  notes: z.string().max(DRAFT_MAX_NOTES),
  documentIds: z.array(z.string().uuid()).max(DRAFT_MAX_DOCUMENTS),
  fields: z.array(z.string().min(1).max(100)).min(1).max(DRAFT_MAX_FIELDS),
})

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/**
 * POST /api/documentos/modelos/redigir — "Redigir com IA" da tela de geração.
 *
 * Um pedido ao provedor por clique, com saída estruturada (um texto por
 * campo): cabe na cota do plano gratuito, ao contrário de uma conversa com o
 * Assistente, que gasta várias. Nada é gravado — o texto volta para o
 * formulário, e quem gera revisa antes de baixar.
 *
 * A permissão é conferida ANTES de chamar o modelo; o modelo e os documentos
 * são lidos com o client de quem pede, então a RLS decide o que entra no
 * contexto.
 */
export async function POST(request: Request) {
  const guard = await requirePermissionApi('ia')
  if (!guard.ok) return guard.response

  const assistantModel = createAssistantModel()
  if (!assistantModel.ok) {
    console.error('[modelos] IA indisponível:', assistantModel.reason)
    return jsonError('A IA não está configurada neste ambiente.', 503)
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError('Requisição inválida.', 400)
  const { templateId, clientId, processId, notes, documentIds } = parsed.data

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('document_templates')
    .select('name, description, category, fields, field_settings')
    .eq('id', templateId)
    .maybeSingle()
  if (error) {
    console.error('[modelos] leitura do modelo falhou:', error.code, error.message)
    return jsonError('Não foi possível ler o modelo.', 500)
  }
  if (!row) return jsonError('Modelo não encontrado.', 404)

  const template = row as Pick<DocumentTemplate, 'name' | 'description' | 'category' | 'fields'> & {
    field_settings: unknown
  }
  // Só campos de IA do próprio modelo: o navegador não escolhe o que a IA
  // escreve além do que o modelo define.
  const aiFields = classifyTemplateFields(
    template.fields ?? [],
    parseFieldSettings(template.field_settings),
  ).ai.filter((field) => parsed.data.fields.includes(field.name))
  if (aiFields.length === 0) return jsonError('Nenhum campo de IA para redigir.', 400)

  let message: Awaited<ReturnType<typeof buildDraftingMessage>>
  try {
    message = await buildDraftingMessage(supabase, {
      template,
      fields: aiFields,
      clientId,
      processId,
      notes,
      documentIds,
    })
  } catch (contextError) {
    console.error('[modelos] contexto da redação falhou:', contextError)
    return jsonError('Não foi possível reunir os dados do caso.', 500)
  }

  const names = aiFields.map((field) => field.name) as [string, ...string[]]
  const schema = draftingOutputSchema(names)

  try {
    const { output } = await generateText({
      model: assistantModel.model,
      system: DRAFTING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message.content }],
      output: Output.object({ schema }),
      providerOptions: assistantModel.providerOptions,
      // Cada nova tentativa gasta cota; uma basta para um soluço de rede.
      maxRetries: 1,
    })

    const texts: Record<string, string> = {}
    for (const item of output.campos) {
      if (item.texto.trim()) texts[item.campo] = item.texto.trim()
    }
    // Documento que ficou de fora volta nomeado: quem gera precisa saber que a
    // IA não o leu antes de confiar no texto.
    return NextResponse.json({ texts, skipped: message.skipped })
  } catch (modelError) {
    if (isProviderQuotaError(modelError)) {
      return jsonError('A cota diária da IA acabou. Tente amanhã ou redija o texto à mão.', 429)
    }
    console.error(`[modelos] redação (${assistantModel.provider}) falhou:`, modelError)
    return jsonError('A IA não conseguiu redigir agora. Tente de novo.', 502)
  }
}
