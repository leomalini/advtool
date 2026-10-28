import type { ModelMessage, SystemModelMessage } from 'ai'

/**
 * Marcas de cache de prompt da Anthropic. O provedor do Gemini ignora a chave
 * `anthropic` — vale para os dois sem condição.
 *
 * O cache é por PREFIXO, na ordem tools → system → mensagens: tudo até a marca
 * precisa ser byte a byte igual ao pedido anterior. Dura 5 minutos sem uso e
 * se renova a cada leitura; lido, custa 5% da entrada no Opus 5.5.
 */
const CACHE_BREAKPOINT = { anthropic: { cacheControl: { type: 'ephemeral' } } } as const

/**
 * Instruções que não mudam entre pedidos. A marca no fim cacheia junto as
 * tools, que vêm antes — no chat, ~15 mil tokens iguais para toda a equipe.
 * O que muda (data, dados do pedido) vai num bloco seguinte, sem marca.
 */
export function cachedInstructions(content: string): SystemModelMessage {
  return { role: 'system', content, providerOptions: CACHE_BREAKPOINT }
}

/** A mensagem sem a marca de cache (e o resto do que a Anthropic recebe dela). */
function withoutBreakpoint(message: ModelMessage): ModelMessage {
  const anthropic = message.providerOptions?.anthropic
  if (!anthropic || !('cacheControl' in anthropic)) return message
  const rest = Object.fromEntries(Object.entries(anthropic).filter(([key]) => key !== 'cacheControl'))
  return { ...message, providerOptions: { ...message.providerOptions, anthropic: rest } }
}

/**
 * Marca o fim do histórico: o passo seguinte (a próxima consulta do mesmo
 * turno, ou a próxima pergunta em até 5 minutos) lê a conversa do cache e só
 * paga cheio o que é novo. Usado em cada passo, pelo `prepareStep`, para a
 * marca acompanhar o histórico que cresce — com a do `system`, são 2 das 4
 * permitidas.
 *
 * As mensagens que o `prepareStep` devolve seguem para o passo seguinte com a
 * marca: sem tirar a dos passos anteriores, um turno de 4 passos chegava a 5
 * marcas (o teto é 4) e a API ignorava uma. Tirar não perde o cache já
 * gravado: cada marca procura acerto até 20 posições para trás, e um passo
 * acrescenta poucas (uma sequência de tool_use ou de tool_result conta uma).
 */
export function withHistoryBreakpoint(messages: ModelMessage[]): ModelMessage[] {
  const last = messages.at(-1)
  if (!last) return messages
  const marked: ModelMessage = {
    ...last,
    providerOptions: { ...last.providerOptions, ...CACHE_BREAKPOINT },
  }
  return [...messages.slice(0, -1).map(withoutBreakpoint), marked]
}
