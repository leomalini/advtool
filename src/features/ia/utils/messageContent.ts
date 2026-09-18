import { isToolUIPart, type UIMessage } from 'ai'

/**
 * A mensagem tem algo que o usuário leia ou que o modelo precise receber:
 * texto não vazio, um anexo ou uma chamada de tool.
 *
 * Um turno que falha no meio (erro da API, chave inválida) ainda produz a
 * mensagem da IA, só com o marcador `step-start` — às vezes com um bloco de
 * raciocínio sem texto. Na tela isso vira um balão vazio; gravada, reaparece
 * a cada vez que a conversa é aberta. Quem mostra, grava ou envia filtra por
 * aqui.
 */
export function hasVisibleContent(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim() !== ''
    return part.type === 'file' || isToolUIPart(part)
  })
}
