import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { AI_ERROR_MESSAGES } from '@/features/ia/errorMessages'
import { createAssistantModel } from '@/features/ia/model'
import { providerErrorKind } from '@/features/ia/providerErrors'
import { checkAiBudget } from '@/features/ia/usage/budget'
import { readDocumentsAsParts, type ReadableDocument } from '@/features/ia/files/documentParts'
import { classifyTemplateFields } from '@/features/documentos/templates/fieldSettings'
import { enrichCompanies, matchClients } from '@/features/contratos/reading/enrichReading'
import { runReader } from '@/features/contratos/reading/runReader'
import type { ReaderResult } from '@/features/contratos/reading/readerTypes'
import { parseFieldSettings, parsePartyRoles } from '@/schemas/documentTemplate.schema'
import { PARTY_ROLE_PRESETS } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'

/** Segundos. Dez documentos com PDF e imagem passam fácil de um minuto. */
export const maxDuration = 180

/** Por leitura. O Gemini aceita até 100 MB por pedido; a folga cobre o texto. */
const MAX_DOCUMENTS = 10
const MAX_TOTAL_BYTES = 50 * 1024 * 1024

const bodySchema = z.object({
  contractId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(MAX_DOCUMENTS),
  mode: z.enum(['partes', 'importar']),
})

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

interface TemplateRow {
  fields: string[] | null
  field_settings: unknown
  parties: unknown
}

/**
 * POST /api/contratos/ler-documentos — o leitor de documentos.
 *
 * Um pedido ao provedor para todos os documentos (até 10, 50 MB): a IA
 * descreve cada documento, e o código junta as pessoas, aponta conflitos e
 * sugere os campos do modelo. Nada é gravado aqui — a tela mostra o
 * resultado para conferir, e só então cria as partes.
 *
 * Os documentos precisam ser do contrato (já estão no Storage: a Vercel não
 * aceita arquivo grande no corpo do pedido). Permissão e leitura com o client
 * de quem pede: a RLS decide o que entra.
 */
export async function POST(request: Request) {
  const guard = await requirePermissionApi('contratos', 'update')
  if (!guard.ok) return guard.response

  const assistantModel = createAssistantModel('contract_reader', { userId: guard.userId })
  if (!assistantModel.ok) {
    console.error('[contratos] IA indisponível:', assistantModel.reason)
    return jsonError('A IA não está configurada neste ambiente.', 503)
  }
  const budget = await checkAiBudget()
  if (!budget.ok) {
    return jsonError(
      budget.reason === 'exceeded' ? AI_ERROR_MESSAGES.budget : AI_ERROR_MESSAGES.unavailable,
      503,
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError('Requisição inválida.', 400)
  const { contractId, documentIds, mode } = parsed.data
  const importing = mode === 'importar'

  const supabase = await createClient()
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, template_id')
    .eq('id', contractId)
    .maybeSingle()
  if (contractError) {
    console.error('[contratos] leitura do contrato falhou:', contractError.code, contractError.message)
    return jsonError('Não foi possível ler o contrato.', 500)
  }
  if (!contract) return jsonError('Contrato não encontrado.', 404)

  const [{ data: rows, error: documentsError }, templateResult] = await Promise.all([
    supabase
      .from('documents')
      .select('id, file_name, file_path, file_size')
      .eq('contract_id', contractId)
      .in('id', documentIds),
    contract.template_id
      ? supabase
          .from('document_templates')
          .select('fields, field_settings, parties')
          .eq('id', contract.template_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (documentsError) {
    console.error('[contratos] leitura dos documentos falhou:', documentsError.code, documentsError.message)
    return jsonError('Não foi possível ler os documentos.', 500)
  }

  // Na ordem do pedido: o primeiro é o contrato, na importação.
  const documents = documentIds
    .map((id) => (rows ?? []).find((row) => row.id === id))
    .filter((row): row is ReadableDocument => !!row)
  if (documents.length === 0) return jsonError('Nenhum documento deste contrato foi enviado.', 400)
  const totalBytes = documents.reduce((sum, document) => sum + Number(document.file_size), 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    return jsonError('Os documentos passam de 50 MB juntos. Leia em duas vezes.', 413)
  }

  const template = templateResult.data as TemplateRow | null
  const templateRoles: TemplatePartyRole[] = template ? parsePartyRoles(template.parties) : []
  const roles = [
    ...templateRoles,
    ...PARTY_ROLE_PRESETS.filter((preset) => !templateRoles.some((role) => role.key === preset.key)),
  ]
  const manualFields = template
    ? classifyTemplateFields(
        template.fields ?? [],
        parseFieldSettings(template.field_settings),
        templateRoles,
      ).manual
    : []

  let numbered = 0
  const { parts, skipped, read } = await readDocumentsAsParts(supabase, documents, (document) => {
    numbered += 1
    return `Documento ${numbered}: ${document.file_name}`
  })
  if (read.length === 0) {
    return NextResponse.json(
      { error: `Nenhum documento pôde ser lido: ${skipped.join('; ')}.` },
      { status: 422 },
    )
  }

  try {
    const result = await runReader({
      model: assistantModel.model,
      providerOptions: assistantModel.providerOptions,
      parts,
      documents: read,
      roles,
      manualFields,
      importing,
    })
    await Promise.all([matchClients(supabase, result.persons), enrichCompanies(result.persons)])
    return NextResponse.json({ ...result, skipped } satisfies ReaderResult)
  } catch (modelError) {
    console.error(`[contratos] leitura (${assistantModel.provider}) falhou:`, modelError)
    switch (providerErrorKind(modelError)) {
      case 'rate_limit':
        return jsonError(`${AI_ERROR_MESSAGES.rateLimit} Ou digite as partes.`, 429)
      case 'credits':
        return jsonError(`${AI_ERROR_MESSAGES.credits} Enquanto isso, digite as partes.`, 402)
      case 'auth':
        return jsonError(`${AI_ERROR_MESSAGES.auth} Enquanto isso, digite as partes.`, 503)
      default:
        return jsonError('A IA não conseguiu ler os documentos agora. Tente de novo.', 502)
    }
  }
}
