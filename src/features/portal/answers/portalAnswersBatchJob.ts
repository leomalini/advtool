import type { BatchJob } from '@/features/ia/batch/types'
import {
  ARRIVAL_INTERVAL_MINUTES,
  getPortalAnswersRecord,
  isPortalAnswersEnabled,
  savePortalAnswers,
} from './ensurePortalAnswers'
import { buildPortalAnswersInput, loadPortalAnswerData, portalAnswersHash } from './portalAnswersInput'
import { PORTAL_ANSWERS_SYSTEM_PROMPT } from './portalAnswersPrompt'
import { portalAnswersSchema, type PortalAnswers } from './portalAnswersSchema'

/**
 * As respostas do portal refeitas na chegada de movimentação, em lote (fase
 * 5). As mesmas condições da fase 3: só processo que já tem respostas, com o
 * recorte mudado, e a última geração com mais de 15 minutos. Quando o cliente
 * abre o chat e a resposta está velha, o portal continua gerando na hora —
 * ele está esperando.
 */
export const portalAnswersBatchJob: BatchJob<PortalAnswers> = {
  kind: 'portal_answers',
  route: 'portal',
  instructions: PORTAL_ANSWERS_SYSTEM_PROMPT,
  toolName: 'registrar_respostas_portal',
  toolDescription: 'Registra as quatro respostas do processo para o portal.',
  schema: portalAnswersSchema,
  maxOutputTokens: 8_000,

  async prepare(admin, legalProcessId) {
    if (!isPortalAnswersEnabled()) return null
    const current = await getPortalAnswersRecord(admin, legalProcessId)
    if (!current?.generated_at) return null
    if (Date.now() - Date.parse(current.generated_at) < ARRIVAL_INTERVAL_MINUTES * 60_000) {
      return null
    }

    const data = await loadPortalAnswerData(admin, legalProcessId)
    if (!data) return null
    const hash = portalAnswersHash(data)
    if (current.source_hash === hash) return null
    return { userText: buildPortalAnswersInput(data), inputHash: hash }
  },

  async apply(admin, legalProcessId, output, meta) {
    // Resposta de um recorte que já mudou nunca vai para o cliente (fase 3):
    // a próxima chegada, ou a abertura do chat, pede de novo.
    const data = await loadPortalAnswerData(admin, legalProcessId)
    if (!data || portalAnswersHash(data) !== meta.inputHash) return 'stale'

    const current = await getPortalAnswersRecord(admin, legalProcessId)
    await savePortalAnswers(admin, legalProcessId, current, {
      answers: output,
      hash: meta.inputHash,
      modelId: meta.modelId,
    })
    return 'applied'
  },
}
