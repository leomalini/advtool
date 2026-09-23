import { NextRequest, NextResponse } from 'next/server'
import {
  APICallError,
  RetryError,
  StreamProviderError,
  convertToModelMessages,
  generateId,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
} from 'ai'
import { z } from 'zod'
import { hasServiceRoleKey } from '@/lib/supabase/admin'
import { NO_STORE, requirePortalSession } from '@/lib/clientPortal/access'
import {
  alternateTurns,
  checkPortalChatQuota,
  loadPortalChatHistory,
  savePortalChatMessage,
} from '@/lib/clientPortal/chat'
import { getPortalProcesses } from '@/lib/clientPortal/data'
import { hasVisibleContent } from '@/features/ia/utils/messageContent'
import { createPortalAssistantModel } from '@/features/portal/assistant/model'
import { buildPortalAssistantPrompt } from '@/features/portal/assistant/prompt'
import {
  createPortalAssistantTools,
  type PortalAssistantUIMessage,
} from '@/features/portal/assistant/tools'
import {
  PORTAL_ASSISTANT_MAX_QUESTION_CHARS,
  PORTAL_ASSISTANT_STREAM_ERRORS,
} from '@/types/clientPortal.types'

/** Segundos. As consultas são ao nosso banco, e a resposta é curta: um turno
 * típico leva de 5 a 20 segundos. */
export const maxDuration = 60

/** Ida e volta entre modelo e tool dentro de um turno. Uma pergunta gasta 2
 * (ver o andamento → responder); comparar processos, algumas a mais. O teto
 * limita o que uma pergunta pode gastar da cota. */
const MAX_STEPS = 5

/** O mesmo formato que a migration 64 confere no banco. */
const bodySchema = z.object({
  conversationId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  text: z.string().trim().min(1).max(PORTAL_ASSISTANT_MAX_QUESTION_CHARS),
})

const UNAVAILABLE_MESSAGE = 'O assistente não está disponível no momento.'

const QUOTA_MESSAGES = {
  hour: 'Você fez muitas perguntas em pouco tempo. Aguarde um pouco e tente de novo.',
  day: 'Você chegou ao limite de perguntas de hoje. Amanhã o assistente volta a responder.',
} as const

function unavailable() {
  return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503, headers: NO_STORE })
}

/**
 * A cota do PROVEDOR acabou (429) — não o limite por link, que é conferido
 * antes. No plano gratuito do Gemini são 20 requisições por dia por modelo,
 * somando a equipe e o portal, e cada pergunta gasta umas duas. Dizer isso ao
 * cliente evita que ele insista numa pergunta que não vai passar hoje.
 */
function isProviderQuotaError(error: unknown): boolean {
  // Recusa na chamada chega como APICallError (embrulhado em RetryError depois
  // das novas tentativas); recusa no meio do stream, como StreamProviderError.
  const cause = RetryError.isInstance(error) ? error.lastError : error
  return (
    (APICallError.isInstance(cause) || StreamProviderError.isInstance(cause)) &&
    cause.statusCode === 429
  )
}

/**
 * POST /api/portal/<token>/assistente — um turno do chat de dúvidas do
 * cliente, em streaming.
 *
 * A ordem das checagens é a do custo: link e cookie de documento
 * (`requirePortalSession`, o mesmo porteiro das outras rotas do portal), a
 * chave que liga o assistente e o limite de uso — tudo ANTES de qualquer
 * chamada ao modelo, porque recusar depois já teria gastado cota.
 *
 * O que o modelo vê é o que a página mostra, e só isso: a lista de
 * `getPortalProcesses` no prompt e a timeline de `getPortalProcessTimeline`
 * pela tool, as duas presas ao cliente do token. As instruções em
 * `features/portal/assistant/prompt.ts` cuidam do comportamento; o sigilo não
 * depende delas.
 *
 * O navegador manda só o texto da pergunta. O histórico vem do banco, então
 * ninguém forja uma "resposta anterior" nem manda um histórico gigante — e o
 * registro guarda o que o cliente perguntou e o que a IA respondeu de fato.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!hasServiceRoleKey()) return unavailable()

  const { token } = await params
  const guard = await requirePortalSession(request, token)
  if (!guard.ok) return guard.response

  const { link, client } = guard

  const assistantModel = createPortalAssistantModel()
  if (!assistantModel.ok) {
    // O motivo cita variável de ambiente: vai para o log, não para o cliente.
    console.error('[portal-ia] assistente indisponível:', assistantModel.reason)
    return unavailable()
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Escreva sua pergunta com até ${PORTAL_ASSISTANT_MAX_QUESTION_CHARS} caracteres.` },
      { status: 400, headers: NO_STORE }
    )
  }
  const { conversationId, text } = parsed.data

  const quota = await checkPortalChatQuota(link.id)
  if (!quota.ok) {
    if (quota.reason === 'error') return unavailable()
    return NextResponse.json(
      { error: QUOTA_MESSAGES[quota.reason] },
      { status: 429, headers: NO_STORE }
    )
  }

  // As duas funções já registram o motivo no log quando falham.
  const loaded = await Promise.all([
    getPortalProcesses(client.id),
    loadPortalChatHistory(link.id, conversationId),
  ]).catch(() => null)
  if (!loaded) {
    return NextResponse.json(
      { error: 'Não foi possível carregar seus processos agora.' },
      { status: 500, headers: NO_STORE }
    )
  }
  const [processes, history] = loaded

  const tools = createPortalAssistantTools(client.id)

  // A pergunta é montada aqui, só com o texto: nenhuma `part` vinda do
  // navegador (arquivo, chamada de tool) chega ao modelo.
  const userMessage: PortalAssistantUIMessage = {
    id: generateId(),
    role: 'user',
    parts: [{ type: 'text', text }],
  }

  // O histórico foi gravado por esta rota, mas a tool pode ter mudado de forma
  // desde então. Se não passar na validação atual, a conversa recomeça da
  // pergunta nova em vez de o turno falhar.
  const validated = await safeValidateUIMessages<PortalAssistantUIMessage>({
    messages: [...history, userMessage],
    tools,
  })
  if (!validated.success) {
    console.error('[portal-ia] histórico descartado:', validated.error.message)
  }
  const messages = alternateTurns(validated.success ? validated.data : [userMessage])

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>
  try {
    modelMessages = await convertToModelMessages(messages, {
      tools,
      // Turno interrompido pode ter deixado uma consulta sem resultado; a API
      // recusaria o pedido inteiro por causa dela.
      ignoreIncompleteToolCalls: true,
    })
  } catch (error) {
    console.error('[portal-ia] preparo das mensagens falhou:', error)
    return NextResponse.json(
      { error: 'Não foi possível preparar a conversa. Recarregue a página e tente de novo.' },
      { status: 500, headers: NO_STORE }
    )
  }

  // Gravada ANTES do modelo: turno que falhar também conta no limite. Sem o
  // registro, o limite não teria o que contar — então o turno é recusado.
  const saved = await savePortalChatMessage({
    linkId: link.id,
    clientId: client.id,
    conversationId,
    role: 'user',
    parts: userMessage.parts,
  })
  if (!saved) return unavailable()

  const result = streamText({
    model: assistantModel.model,
    system: buildPortalAssistantPrompt(new Date(), processes),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    providerOptions: assistantModel.providerOptions,
    onError: ({ error }) => {
      console.error(`[portal-ia] streamText (${assistantModel.provider}) falhou:`, error)
    },
  })

  return result.toUIMessageStreamResponse<PortalAssistantUIMessage>({
    headers: NO_STORE,
    originalMessages: messages,
    generateMessageId: generateId,
    // O raciocínio do modelo discute as instruções e o que ele vai ou não
    // dizer. Nada disso é para o cliente.
    sendReasoning: false,
    onEnd: async ({ responseMessage }) => {
      // Turno que falhou antes de escrever qualquer coisa não vira registro:
      // a pergunta já está gravada, e o histórico se ajeita sem a resposta.
      if (!hasVisibleContent(responseMessage)) return

      await savePortalChatMessage({
        linkId: link.id,
        clientId: client.id,
        conversationId,
        role: 'assistant',
        parts: responseMessage.parts,
      })
    },
    // Detalhe do erro fica no log (onError do streamText), não no chat.
    onError: (error) =>
      isProviderQuotaError(error)
        ? PORTAL_ASSISTANT_STREAM_ERRORS.providerQuota
        : PORTAL_ASSISTANT_STREAM_ERRORS.generic,
  })
}
