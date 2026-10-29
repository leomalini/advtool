import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { AiRoute } from '../model'

/**
 * Lote (fase 5 de `docs/assistente-claude.md`): o que roda em segundo plano
 * pela Batch API da Anthropic, pela metade do preço. Cada tipo de trabalho
 * sabe montar o pedido e gravar o resultado; o envio e a coleta são comuns
 * (`enqueue.ts`, `collect.ts`) e o estado fica em `ai_batch_items`
 * (migration 85).
 */
export type BatchKind = 'triage' | 'process_summary' | 'portal_answers'

/** O pedido de um registro, pronto para entrar no lote. */
export interface PreparedBatchRequest {
  /** O texto da mensagem do usuário: os dados do registro. */
  userText: string
  /** A impressão digital dos dados usados — a coleta descarta resultado de
   * dado que mudou. */
  inputHash: string
  /** O que a gravação precisa e não volta do modelo (vai para `context`). */
  context?: unknown
}

/** O que a gravação recebe além do resultado. */
export interface BatchApplyMeta {
  inputHash: string
  context: unknown
  /** O modelo que respondeu. */
  modelId: string
  /** Quando o pedido foi feito — o resumo vale até ali. */
  requestedAt: string
}

export type BatchApplyOutcome = 'applied' | 'stale'

export interface BatchJob<Output = unknown> {
  kind: BatchKind
  /** A rota do consumo e das configurações (modelo, esforço). */
  route: AiRoute
  /** As instruções: iguais para todos os pedidos do tipo (o cache as reusa). */
  instructions: string
  /** O lote do AI SDK não aceita saída estruturada: o resultado vem como a
   * chamada desta tool (`strict`), que o modelo é instruído a fazer. */
  toolName: string
  toolDescription: string
  schema: z.ZodType<Output>
  maxOutputTokens: number
  /** `null`: não há o que pedir (já atualizado, registro sumiu…). */
  prepare(admin: SupabaseClient, entityId: string): Promise<PreparedBatchRequest | null>
  /** Grava o resultado, ou diz que ele ficou velho. */
  apply(
    admin: SupabaseClient,
    entityId: string,
    output: Output,
    meta: BatchApplyMeta,
  ): Promise<BatchApplyOutcome>
}

/** O fim das instruções de todo trabalho em lote: é a tool que leva a resposta. */
export function batchToolInstruction(toolName: string): string {
  return (
    `\n\n## Como responder\nResponda chamando a tool ${toolName} uma única vez, com a ` +
    'resposta completa nos campos dela. Não escreva texto fora da tool.'
  )
}
