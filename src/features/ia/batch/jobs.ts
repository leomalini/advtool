import { tool, type Tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { portalAnswersBatchJob } from '@/features/portal/answers/portalAnswersBatchJob'
import { processSummaryBatchJob } from '@/features/processos/summary/summaryBatchJob'
import { triageBatchJob } from '@/features/publicacoes/triage/triageBatchJob'
import {
  batchToolInstruction,
  type BatchApplyMeta,
  type BatchApplyOutcome,
  type BatchJob,
  type BatchKind,
  type PreparedBatchRequest,
} from './types'

/** Um trabalho pronto para o envio e a coleta, que não conhecem o formato do
 * resultado: `applyRaw` valida antes de gravar. */
export interface RegisteredBatchJob {
  kind: BatchKind
  route: BatchJob['route']
  instructions: string
  toolName: string
  tool: Tool
  maxOutputTokens: number
  prepare(admin: SupabaseClient, entityId: string): Promise<PreparedBatchRequest | null>
  applyRaw(
    admin: SupabaseClient,
    entityId: string,
    raw: unknown,
    meta: BatchApplyMeta,
  ): Promise<BatchApplyOutcome | 'invalid'>
}

function register<Output>(job: BatchJob<Output>): RegisteredBatchJob {
  return {
    kind: job.kind,
    route: job.route,
    instructions: job.instructions + batchToolInstruction(job.toolName),
    toolName: job.toolName,
    // Só a definição: no lote nada executa. `strict` faz a API devolver
    // entrada válida pelo esquema — é a saída estruturada do lote.
    tool: tool({ description: job.toolDescription, inputSchema: job.schema, strict: true }),
    maxOutputTokens: job.maxOutputTokens,
    prepare: (admin, entityId) => job.prepare(admin, entityId),
    applyRaw: async (admin, entityId, raw, meta) => {
      const parsed = job.schema.safeParse(raw)
      if (!parsed.success) return 'invalid'
      return job.apply(admin, entityId, parsed.data, meta)
    },
  }
}

export const BATCH_JOBS: Record<BatchKind, RegisteredBatchJob> = {
  triage: register(triageBatchJob),
  process_summary: register(processSummaryBatchJob),
  portal_answers: register(portalAnswersBatchJob),
}

/** As definições das tools de todos os trabalhos, para a coleta validar as
 * chamadas que voltam. Nomes diferentes por trabalho: a API exige a mesma
 * definição para o mesmo nome dentro de um lote. */
export const BATCH_TOOLS: Record<string, Tool> = Object.fromEntries(
  Object.values(BATCH_JOBS).map((job) => [job.toolName, job.tool]),
)
