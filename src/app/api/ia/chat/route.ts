import { NextResponse } from 'next/server'
import {
  convertToModelMessages,
  generateId,
  isToolUIPart,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { ensureConversation } from '@/features/ia/conversation'
import { createAiFileDownload } from '@/features/ia/files/download'
import { InvalidAttachmentError, prepareMessagesForModel } from '@/features/ia/files/prepareMessages'
import { createAssistantModel } from '@/features/ia/model'
import { buildSystemPrompt } from '@/features/ia/prompts/system'
import { createAssistantTools, type AssistantUIMessage } from '@/features/ia/tools'
import { hasVisibleContent } from '@/features/ia/utils/messageContent'

/** Segundos. Um turno com várias consultas e raciocínio passa fácil de um
 * minuto, acima do limite padrão de várias plataformas de deploy — o stream
 * seria cortado no meio da resposta. */
export const maxDuration = 300

/** Ida e volta entre modelo e tools dentro de UM turno. Uma pergunta típica
 * gasta 2–3 (buscar → detalhar → responder); o teto evita um laço que só
 * queima crédito. */
const MAX_STEPS = 8

/** Histórico máximo aceito num turno. Conversa maior que isso é melhor
 * recomeçar — e o teto impede um corpo arbitrariamente grande de chegar ao
 * modelo às custas do escritório. */
const MAX_MESSAGES = 200

/**
 * O envelope. O conteúdo de `parts` (inclusive entrada e saída de cada tool)
 * é validado depois por `safeValidateUIMessages`, contra os schemas das tools.
 *
 * `role` não aceita 'system' de propósito: o system prompt é do servidor, e
 * uma mensagem de sistema vinda do browser falaria com a autoridade dele.
 */
const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.unknown()),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
})

/** Título da conversa: o começo da primeira pergunta. */
function titleFrom(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === 'user')
  const text = first?.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim()
  if (!text) return null
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/**
 * Chamadas de tool de turnos anteriores — as feitas depois da última pergunta
 * são do turno atual, inclusive quando ele continua após uma ação confirmada.
 * `ler_arquivo` só reenvia o conteúdo ao modelo no turno atual.
 */
function toolCallIdsBeforeLastUserMessage(messages: AssistantUIMessage[]): Set<string> {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
  const ids = new Set<string>()
  for (const message of messages.slice(0, Math.max(lastUserIndex, 0))) {
    for (const part of message.parts) {
      if (isToolUIPart(part)) ids.add(part.toolCallId)
    }
  }
  return ids
}

/**
 * POST /api/ia/chat — um turno do assistente, em streaming.
 *
 * A permissão é conferida ANTES de qualquer chamada ao modelo: negar depois
 * já teria gastado token. As tools rodam com o client do usuário (cookies),
 * então cada consulta é filtrada pela RLS como se a tela tivesse feito.
 *
 * Persistência: ao terminar o turno, o histórico inteiro (com os `parts` de
 * tool) é gravado por upsert. Regravar tudo é barato — conversas são curtas —
 * e é o único jeito de guardar também o resultado das ações confirmadas no
 * browser, que só chegam aqui no turno seguinte. O `onEnd` roda dentro do
 * `flush` do stream, então o browser só recebe o fim depois de gravado.
 */
export async function POST(request: Request) {
  const guard = await requirePermissionApi('ia')
  if (!guard.ok) return guard.response

  // Antes de tocar no banco: sem provedor configurado não há o que fazer.
  const assistantModel = createAssistantModel()
  if (!assistantModel.ok) {
    return NextResponse.json(
      { error: `Assistente não configurado: ${assistantModel.reason}` },
      { status: 503 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  const { conversationId } = parsed.data

  const supabase = await createClient()

  // Os schemas das tools não dependem do turno — o contexto só importa na hora
  // de montar o que o modelo recebe. Validar com um contexto vazio basta.
  const validated = await safeValidateUIMessages<AssistantUIMessage>({
    messages: parsed.data.messages,
    tools: createAssistantTools(supabase, {
      historicalToolCallIds: new Set(),
      userId: guard.userId,
      conversationId,
    }),
  })
  if (!validated.success) {
    console.error('[ia] mensagens inválidas:', validated.error.message)
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
  }
  const messages = validated.data

  const conversation = await ensureConversation(supabase, {
    id: conversationId,
    userId: guard.userId,
    title: titleFrom(messages),
  })
  if (conversation === 'not-found') {
    return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
  }
  if (conversation === 'error') {
    return NextResponse.json({ error: 'Não foi possível abrir a conversa.' }, { status: 500 })
  }

  const tools = createAssistantTools(supabase, {
    historicalToolCallIds: toolCallIdsBeforeLastUserMessage(messages),
    userId: guard.userId,
    conversationId,
  })

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>
  try {
    const prepared = await prepareMessagesForModel(messages, supabase)
    // Sem as mensagens vazias de turnos que falharam (ver hasVisibleContent).
    modelMessages = await convertToModelMessages(prepared.filter(hasVisibleContent), {
      tools,
      // Um turno interrompido (botão Parar) pode ter ficado com uma consulta
      // sem resultado no histórico; a API recusaria o pedido inteiro por isso.
      ignoreIncompleteToolCalls: true,
    })
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return NextResponse.json({ error: 'Anexo inválido.' }, { status: 400 })
    }
    console.error('[ia] preparo das mensagens falhou:', error)
    return NextResponse.json({ error: 'Não foi possível ler os anexos.' }, { status: 500 })
  }

  const result = streamText({
    model: assistantModel.model,
    system: buildSystemPrompt(new Date()),
    messages: modelMessages,
    // Anexo `ai-file://` → bucket, com a RLS de quem pergunta. Qualquer outra
    // URL é recusada (ver createAiFileDownload).
    experimental_download: createAiFileDownload(supabase),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    providerOptions: assistantModel.providerOptions,
    onError: ({ error }) => {
      console.error(`[ia] streamText (${assistantModel.provider}) falhou:`, error)
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Sem isto a mensagem da IA nasce com id vazio do lado do servidor e com
    // outro id no browser — o upsert do turno seguinte a duplicaria.
    generateMessageId: generateId,
    onEnd: async ({ messages: finalMessages }) => {
      // Turno que falhou deixa a resposta da IA vazia: a pergunta fica
      // gravada (dá para tentar de novo), o balão vazio não.
      const rows = finalMessages.filter(hasVisibleContent).map((m, index) => ({
        id: m.id,
        conversation_id: conversationId,
        role: m.role,
        parts: m.parts,
        position: index,
      }))

      const { error } = await supabase
        .from('ai_messages')
        .upsert(rows, { onConflict: 'conversation_id,id' })
      if (error) {
        console.error('[ia] upsert mensagens falhou:', error.code, error.message)
        return
      }

      const { error: touchError } = await supabase
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
      if (touchError) {
        console.error('[ia] updated_at da conversa falhou:', touchError.code, touchError.message)
      }
    },
    // Detalhe do erro fica no log (onError do streamText), não no chat.
    onError: () => 'O assistente falhou ao responder. Tente de novo.',
  })
}
