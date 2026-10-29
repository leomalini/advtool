/**
 * O que a EQUIPE lê quando a IA falha — no chat, na leitura de documentos e na
 * redação. Mora sem dependências porque o servidor escolhe a mensagem e a tela
 * a reconhece (ver `ChatPanel`): texto fora desta lista vira a genérica.
 *
 * O cliente do portal nunca vê estas — chave, créditos e teto são assunto do
 * escritório. Ele tem as suas em `PORTAL_ASSISTANT_STREAM_ERRORS`.
 */
export const AI_ERROR_MESSAGES = {
  generic: 'O assistente falhou ao responder. Tente de novo.',
  auth: 'O provedor da IA não aceitou a chave configurada. Quem administra a conta precisa conferi-la.',
  credits: 'Os créditos da conta da IA acabaram. Quem administra a conta precisa pôr saldo.',
  rateLimit: 'A IA atingiu o limite de pedidos por agora. Tente de novo em alguns minutos.',
  overloaded: 'O provedor da IA está sobrecarregado agora. Tente de novo em instantes.',
  refusal: 'Os filtros de segurança do provedor da IA recusaram este pedido. Reformule e tente de novo.',
  budget: 'O teto mensal de gasto com a IA foi atingido. Quem administra o escritório pode aumentá-lo.',
  unavailable: 'A IA está indisponível agora. Tente de novo mais tarde.',
} as const

export type AiErrorMessage = (typeof AI_ERROR_MESSAGES)[keyof typeof AI_ERROR_MESSAGES]
