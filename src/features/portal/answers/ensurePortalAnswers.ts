import { generateText, Output } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { createAssistantModel } from '@/features/ia/model'
import { checkAiBudget } from '@/features/ia/usage/budget'
import type { UsageScope } from '@/features/ia/usage/recordUsage'
import {
  buildPortalAnswersInput,
  loadPortalAnswerData,
  portalAnswersHash,
} from './portalAnswersInput'
import { PORTAL_ANSWERS_SYSTEM_PROMPT } from './portalAnswersPrompt'
import {
  portalAnswersSchema,
  type PortalAnswers,
  type PortalAnswersRecord,
  type PortalQuestionKey,
} from './portalAnswersSchema'

/** Na chegada de movimentação, no máximo uma geração a cada 15 min por processo
 * — o que sobrar de uma rajada se refaz quando o cliente abrir. */
export const ARRIVAL_INTERVAL_MINUTES = 15

/** Reserva mais velha que isso foi abandonada (a função morreu no meio). */
const CLAIM_TIMEOUT_MINUTES = 5

const RECORD_COLUMNS =
  'legal_process_id, answers, corrections, hidden, superseded, source_hash, model, ' +
  'generated_at, refreshing_since'

export type PortalAnswersTrigger = 'page' | 'webhook' | 'sync' | 'office'

export type PortalAnswersOutcome =
  | { status: 'ready'; record: PortalAnswersRecord }
  | { status: 'preparing' }
  | { status: 'skipped' }
  | { status: 'unavailable' }

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/**
 * `PORTAL_ASSISTANT_ENABLED=false` tira a IA da frente do cliente sem tirá-la
 * da equipe — o mesmo interruptor do antigo chat do portal.
 */
export function isPortalAnswersEnabled(): boolean {
  return process.env.PORTAL_ASSISTANT_ENABLED?.trim().toLowerCase() !== 'false'
}

async function releaseClaim(admin: SupabaseClient, legalProcessId: string) {
  const { error } = await admin
    .from('client_portal_answers')
    .update({ refreshing_since: null })
    .eq('legal_process_id', legalProcessId)
  if (error) console.error('[portal-respostas] liberar a reserva falhou:', error.code, error.message)
}

/** Reserva o processo para gerar. Linha nova nasce já reservada; linha velha só
 * é reservada se ninguém a reservou há menos de 5 minutos. */
async function claim(
  admin: SupabaseClient,
  legalProcessId: string,
  exists: boolean,
): Promise<boolean> {
  const now = new Date().toISOString()
  if (!exists) {
    const { data, error } = await admin
      .from('client_portal_answers')
      .upsert(
        { legal_process_id: legalProcessId, refreshing_since: now },
        { onConflict: 'legal_process_id', ignoreDuplicates: true },
      )
      .select('legal_process_id')
    if (error) throw error
    return (data ?? []).length > 0
  }
  const { data, error } = await admin
    .from('client_portal_answers')
    .update({ refreshing_since: now })
    .eq('legal_process_id', legalProcessId)
    .or(`refreshing_since.is.null,refreshing_since.lt."${minutesAgo(CLAIM_TIMEOUT_MINUTES)}"`)
    .select('legal_process_id')
  if (error) throw error
  return (data ?? []).length > 0
}

/**
 * Grava respostas novas — na hora (`ensurePortalAnswers`) ou do lote (fase 5).
 * A correção do escritório, se havia, passa para `superseded`: falava dos dados
 * antigos. O que o escritório ocultou continua oculto.
 */
export async function savePortalAnswers(
  admin: SupabaseClient,
  legalProcessId: string,
  current: PortalAnswersRecord | null,
  generated: { answers: PortalAnswers; hash: string; modelId: string },
): Promise<PortalAnswersRecord> {
  const now = new Date().toISOString()
  const superseded = { ...(current?.superseded ?? {}) }
  for (const [key, correction] of Object.entries(current?.corrections ?? {})) {
    if (correction) superseded[key as PortalQuestionKey] = { ...correction, superseded_at: now }
  }

  const { data, error } = await admin
    .from('client_portal_answers')
    .update({
      answers: generated.answers,
      corrections: {},
      superseded,
      source_hash: generated.hash,
      model: generated.modelId,
      generated_at: now,
      refreshing_since: null,
    })
    .eq('legal_process_id', legalProcessId)
    .select(RECORD_COLUMNS)
    .single()
  if (error) throw error
  return data as unknown as PortalAnswersRecord
}

/** As respostas gravadas de um processo, ou `null`. */
export async function getPortalAnswersRecord(
  admin: SupabaseClient,
  legalProcessId: string,
): Promise<PortalAnswersRecord | null> {
  const { data, error } = await admin
    .from('client_portal_answers')
    .select(RECORD_COLUMNS)
    .eq('legal_process_id', legalProcessId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as PortalAnswersRecord | null) ?? null
}

/**
 * Garante respostas que batem com o que a página do cliente mostra AGORA
 * (fase 3; migration 84) — SÓ SERVIDOR, pela service_role.
 *
 * - Impressão digital igual à do recorte atual: devolve o que está gravado,
 *   sem chamar a IA. É o caso de quase toda abertura.
 * - Diferente (ou nunca gerado): gera de novo, numa chamada só. Ao abrir
 *   (`page`, `office`) sempre — resposta defasada pode falar de movimentação
 *   que o escritório ocultou, e não é mostrada. Na chegada (`webhook`,
 *   `sync`) só se o processo já tem respostas e a última geração tem mais de
 *   15 minutos.
 * - Outra geração do mesmo processo em curso: `preparing`.
 *
 * A correção do escritório, se havia, passa para `superseded` — falava dos
 * dados antigos. O que o escritório ocultou continua oculto. Nunca lança.
 */
export async function ensurePortalAnswers(
  legalProcessId: string,
  trigger: PortalAnswersTrigger,
  scope: UsageScope = {},
): Promise<PortalAnswersOutcome> {
  if (!isPortalAnswersEnabled()) return { status: 'unavailable' }
  if (!hasServiceRoleKey()) {
    console.error('[portal-respostas] SUPABASE_SERVICE_ROLE_KEY ausente.')
    return { status: 'unavailable' }
  }
  const admin = createAdminClient()
  let claimed = false

  try {
    const data = await loadPortalAnswerData(admin, legalProcessId)
    if (!data) return { status: 'unavailable' }
    const hash = portalAnswersHash(data)

    const { data: currentRow, error } = await admin
      .from('client_portal_answers')
      .select(RECORD_COLUMNS)
      .eq('legal_process_id', legalProcessId)
      .maybeSingle()
    if (error) throw error
    const current = currentRow as PortalAnswersRecord | null

    if (current && current.source_hash === hash) return { status: 'ready', record: current }

    if (trigger === 'webhook' || trigger === 'sync') {
      // Na chegada, só quem já tem respostas — e sem gerar a cada movimentação
      // de uma rajada.
      if (!current?.generated_at) return { status: 'skipped' }
      const age = Date.now() - new Date(current.generated_at).getTime()
      if (age < ARRIVAL_INTERVAL_MINUTES * 60_000) return { status: 'skipped' }
    }

    claimed = await claim(admin, legalProcessId, Boolean(current))
    if (!claimed) return { status: 'preparing' }

    const budget = await checkAiBudget()
    if (!budget.ok) {
      await releaseClaim(admin, legalProcessId)
      claimed = false
      return { status: 'unavailable' }
    }
    const model = createAssistantModel('portal', scope)
    if (!model.ok) {
      console.error('[portal-respostas] IA indisponível:', model.reason)
      await releaseClaim(admin, legalProcessId)
      claimed = false
      return { status: 'unavailable' }
    }

    const { output, response } = await generateText({
      model: model.model,
      instructions: PORTAL_ANSWERS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPortalAnswersInput(data) }],
      output: Output.object({ schema: portalAnswersSchema }),
      providerOptions: model.providerOptions,
      // Cada nova tentativa é cobrada; uma basta para um soluço de rede.
      maxRetries: 1,
    })

    const saved = await savePortalAnswers(admin, legalProcessId, current, {
      answers: output,
      hash,
      modelId: response.modelId,
    })
    claimed = false

    console.info(`[portal-respostas] ${legalProcessId} gerado (${trigger}).`)
    return { status: 'ready', record: saved }
  } catch (error) {
    console.error(`[portal-respostas] ${legalProcessId} (${trigger}) falhou:`, error)
    if (claimed) await releaseClaim(admin, legalProcessId)
    return { status: 'unavailable' }
  }
}
