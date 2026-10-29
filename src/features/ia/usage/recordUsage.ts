import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import type { AiRoute, AssistantProvider } from '../model'
import { estimateCostUsd, type TokenCounts } from './pricing'

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>
type ModelStreamPart =
  Awaited<ReturnType<WrapStream>>['stream'] extends ReadableStream<infer Part> ? Part : never
type ModelFinishPart = Extract<ModelStreamPart, { type: 'finish' }>
type ModelUsage = ModelFinishPart['usage']
type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model']

/** De quem é a chamada — o que liga a linha de `ai_usage` a uma pessoa ou link. */
export interface UsageScope {
  userId?: string
  portalLinkId?: string
  conversationId?: string
}

interface RecordingContext {
  route: AiRoute
  provider: AssistantProvider
  scope: UsageScope
}

function tokenCounts(usage: ModelUsage): TokenCounts {
  const cacheRead = usage.inputTokens.cacheRead ?? 0
  const cacheWrite = usage.inputTokens.cacheWrite ?? 0
  const input =
    usage.inputTokens.noCache ??
    Math.max((usage.inputTokens.total ?? 0) - cacheRead - cacheWrite, 0)
  return { input, cacheRead, cacheWrite, output: usage.outputTokens.total ?? 0 }
}

/**
 * Grava uma chamada em `ai_usage`, pela service_role (só o servidor escreve ali
 * — ver a migration 81).
 *
 * Nunca lança: o registro é telemetria, e uma falha aqui não pode derrubar a
 * resposta que a pessoa está recebendo. O motivo fica no log `[ia-uso]`.
 */
async function insertUsage(
  context: RecordingContext,
  model: string,
  usage: ModelUsage,
  finishReason: string,
): Promise<void> {
  if (!hasServiceRoleKey()) {
    console.error('[ia-uso] SUPABASE_SERVICE_ROLE_KEY ausente: consumo não registrado.')
    return
  }

  const tokens = tokenCounts(usage)
  try {
    const { error } = await createAdminClient()
      .from('ai_usage')
      .insert({
        route: context.route,
        provider: context.provider,
        model,
        user_id: context.scope.userId ?? null,
        portal_link_id: context.scope.portalLinkId ?? null,
        conversation_id: context.scope.conversationId ?? null,
        input_tokens: tokens.input,
        cache_read_tokens: tokens.cacheRead,
        cache_write_tokens: tokens.cacheWrite,
        output_tokens: tokens.output,
        reasoning_tokens: usage.outputTokens.reasoning ?? null,
        finish_reason: finishReason,
        cost_usd: estimateCostUsd(model, tokens),
      })
    if (error) console.error('[ia-uso] gravação falhou:', error.code, error.message)
  } catch (error) {
    console.error('[ia-uso] gravação falhou:', error)
  }
}

function usageMiddleware(context: RecordingContext): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, model }) => {
      const result = await doGenerate()
      await insertUsage(
        context,
        result.response?.modelId ?? model.modelId,
        result.usage,
        result.finishReason.unified,
      )
      return result
    },

    wrapStream: async ({ doStream, model }) => {
      const { stream, ...rest } = await doStream()

      let responseModelId: string | undefined
      let finish: ModelFinishPart | undefined
      const recorder = new TransformStream<ModelStreamPart, ModelStreamPart>({
        transform(part, controller) {
          if (part.type === 'response-metadata' && part.modelId) responseModelId = part.modelId
          if (part.type === 'finish') finish = part
          controller.enqueue(part)
        },
        // Ao fim do passo, antes do próximo: o consumo já é conhecido.
        async flush() {
          if (!finish) return
          await insertUsage(
            context,
            responseModelId ?? model.modelId,
            finish.usage,
            finish.finishReason.unified,
          )
        },
      })

      return { ...rest, stream: stream.pipeThrough(recorder) }
    },
  }
}

/**
 * O modelo, registrando em `ai_usage` cada chamada que fizer — cada PASSO de
 * um turno com tools, não o turno inteiro. Assim o consumo fica gravado mesmo
 * quando um passo posterior falha, e o custo por conversa é a soma das linhas.
 */
export function withUsageRecording(model: WrappableModel, context: RecordingContext) {
  return wrapLanguageModel({ model, middleware: usageMiddleware(context) })
}
