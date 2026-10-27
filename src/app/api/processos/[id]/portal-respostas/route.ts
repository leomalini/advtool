import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import {
  ensurePortalAnswers,
  isPortalAnswersEnabled,
} from '@/features/portal/answers/ensurePortalAnswers'
import { loadPortalAnswerData, portalAnswersHash } from '@/features/portal/answers/portalAnswersInput'
import {
  PORTAL_QUESTIONS,
  type OfficePortalAnswers,
  type PortalAnswersRecord,
  type PortalQuestionKey,
} from '@/features/portal/answers/portalAnswersSchema'

/** Segundos. "Preparar agora" gera na hora: de 5 a 20 s. */
export const maxDuration = 60

/** Tamanho máximo de uma correção do escritório. */
const MAX_CORRECTION_CHARS = 2000

const RECORD_COLUMNS =
  'legal_process_id, answers, corrections, hidden, superseded, source_hash, model, ' +
  'generated_at, refreshing_since'

const paramsSchema = z.object({ id: z.string().uuid() })

const questionKeys = PORTAL_QUESTIONS.map((question) => question.key) as [
  PortalQuestionKey,
  ...PortalQuestionKey[],
]
const questionSchema = z.enum(questionKeys)

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('correct'),
    question: questionSchema,
    text: z.string().trim().min(1).max(MAX_CORRECTION_CHARS),
  }),
  z.object({ action: z.literal('clear_correction'), question: questionSchema }),
  z.object({ action: z.literal('set_hidden'), question: questionSchema, hidden: z.boolean() }),
  z.object({ action: z.literal('dismiss_superseded'), question: questionSchema }),
])

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

async function readRecord(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_portal_answers')
    .select(RECORD_COLUMNS)
    .eq('legal_process_id', id)
    .maybeSingle()
  if (error) throw error
  return { supabase, record: data as unknown as PortalAnswersRecord | null }
}

/**
 * GET /api/processos/<id>/portal-respostas — as respostas das perguntas fixas
 * do portal como estão gravadas, e se ainda batem com o que o cliente vê
 * (fase 3, D6). A impressão digital é calculada aqui: só o servidor monta o
 * recorte do portal.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'view')
  if (!guard.ok) return guard.response
  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return jsonError('Processo inválido.', 400)
  const { id } = parsed.data

  try {
    const { record } = await readRecord(id)
    let stale = false
    if (record && hasServiceRoleKey()) {
      const data = await loadPortalAnswerData(createAdminClient(), id)
      stale = !data || portalAnswersHash(data) !== record.source_hash
    }
    return NextResponse.json({
      enabled: isPortalAnswersEnabled(),
      record,
      stale,
    } satisfies OfficePortalAnswers)
  } catch (error) {
    console.error('[portal-respostas] leitura pelo escritório falhou:', error)
    return jsonError('Não foi possível ler as respostas do portal.', 500)
  }
}

/**
 * POST — prepara (ou atualiza) as respostas agora, sem esperar o cliente
 * abrir o portal. Só gera se o que o portal mostra mudou.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'update')
  if (!guard.ok) return guard.response
  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return jsonError('Processo inválido.', 400)

  const outcome = await ensurePortalAnswers(parsed.data.id, 'office', { userId: guard.userId })
  if (outcome.status === 'ready') return NextResponse.json(outcome.record)
  if (outcome.status === 'preparing') {
    return jsonError('As respostas já estão sendo preparadas. Aguarde alguns segundos.', 409)
  }
  return jsonError('Não foi possível preparar as respostas agora.', 503)
}

/**
 * PATCH — a revisão do escritório (D6): corrigir o texto de uma pergunta,
 * voltar ao da IA, ocultar ou mostrar, e dispensar o aviso de correção
 * substituída. Grava com o client de quem pede: a RLS exige
 * `processos:update`. Quem corrigiu fica registrado na correção.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermissionApi('processos', 'update')
  if (!guard.ok) return guard.response
  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) return jsonError('Processo inválido.', 400)
  const body = patchSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return jsonError('Requisição inválida.', 400)
  const { id } = parsedParams.data
  const change = body.data

  try {
    const { supabase, record } = await readRecord(id)
    if (!record) return jsonError('Este processo ainda não tem respostas no portal.', 404)

    const corrections = { ...record.corrections }
    const superseded = { ...record.superseded }
    let hidden = [...record.hidden]

    switch (change.action) {
      case 'correct':
        corrections[change.question] = {
          text: change.text,
          by: guard.userId,
          at: new Date().toISOString(),
        }
        break
      case 'clear_correction':
        delete corrections[change.question]
        break
      case 'set_hidden':
        hidden = change.hidden
          ? [...new Set([...hidden, change.question])]
          : hidden.filter((question) => question !== change.question)
        break
      case 'dismiss_superseded':
        delete superseded[change.question]
        break
    }

    const { data, error } = await supabase
      .from('client_portal_answers')
      .update({ corrections, superseded, hidden })
      .eq('legal_process_id', id)
      .select(RECORD_COLUMNS)
      .single()
    if (error) {
      console.error('[portal-respostas] revisão falhou:', error.code, error.message)
      return jsonError('Não foi possível salvar a revisão.', 500)
    }
    return NextResponse.json(data as unknown as PortalAnswersRecord)
  } catch (error) {
    console.error('[portal-respostas] revisão falhou:', error)
    return jsonError('Não foi possível salvar a revisão.', 500)
  }
}
