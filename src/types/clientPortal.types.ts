/**
 * O contrato entre `/api/portal/*` e a página `/acompanhar/<token>`.
 *
 * É deliberadamente MENOR que `LegalProcessWithRelations`: tudo que está aqui
 * é visível a quem tem o link e o documento, então o tipo é a lista do que o
 * escritório aceita mostrar. Campo que não existe aqui não vaza por descuido
 * num `select('*')` — a rota monta o objeto campo a campo.
 *
 * Fora de propósito na v1: documentos, financeiro, próxima audiência, partes,
 * responsável interno e qualquer anotação do escritório.
 */

/** Como o link foi emitido/está hoje — usado na tela do escritório. */
export interface ClientPortalLink {
  id: string
  client_id: string
  token_hint: string
  expires_at: string | null
  revoked_at: string | null
  last_accessed_at: string | null
  access_count: number
  created_at: string
  /**
   * A URL completa, decifrada no servidor a cada leitura (migration 58).
   *
   * `null` quando o token guardado não pôde ser aberto — link emitido antes
   * daquela migration, ou segredo do servidor rotacionado depois da emissão.
   * Nos dois casos a tela oferece reemitir, que é o único caminho.
   */
  url: string | null
}

/** Na emissão a URL sempre existe: ela acabou de ser gerada. */
export interface IssuedClientPortalLink extends ClientPortalLink {
  url: string
}

export type ClientPortalAccessOutcome =
  | 'granted'
  | 'token_invalid'
  | 'token_revoked'
  | 'token_expired'
  | 'document_mismatch'
  | 'rate_limited'

export interface ClientPortalAccessLogEntry {
  id: string
  outcome: ClientPortalAccessOutcome
  created_at: string
}

/** Uma movimentação como o cliente a vê. Sem `raw_data`, sem `read_at`, sem
 * `handled_at`: estado interno de tratamento não é assunto dele. */
export interface PortalMovement {
  id: string
  movement_date: string
  title: string | null
  description: string
}

/**
 * O processo como a LISTA o mostra — sem o texto das movimentações.
 *
 * A timeline não vem junto de propósito. Um cliente com vinte processos
 * receberia centenas de movimentações, com o corpo inteiro de cada uma, para
 * ler talvez uma — e pagaria isso numa conexão de celular, que é de onde o
 * link é aberto. O resumo abaixo é o que a lista precisa; o resto chega quando
 * o processo é aberto.
 */
export interface PortalProcess {
  id: string
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  filing_date: string | null
  process_type: string
  status: string
  /** Título do caso no escritório — o que dá nome ao processo na listagem. */
  title: string | null
  /** Quantas movimentações visíveis existem — o rótulo do card. */
  movement_count: number
  /** A mais recente, só data e título: é o que diz "andou" sem abrir nada. */
  last_movement: { movement_date: string; title: string | null } | null
}

/** A timeline de um processo, carregada quando o cliente o abre. */
export interface PortalProcessTimeline {
  process_id: string
  movements: PortalMovement[]
  /** `true` quando há mais do que o teto por processo — a tela avisa em vez de
   * deixar o cliente achando que viu o processo inteiro. */
  truncated: boolean
}

export interface PortalPayload {
  /** Nome de quem está acompanhando, para a página cumprimentar. */
  client_name: string
  processes: PortalProcess[]
  generated_at: string
  /** Mostra o chat de dúvidas: o assistente está ligado no servidor e há
   * processo sobre o que perguntar. */
  assistant_enabled: boolean
}

/** Tamanho máximo de uma pergunta ao assistente do portal — o campo da página
 * e a rota usam o mesmo teto. */
export const PORTAL_ASSISTANT_MAX_QUESTION_CHARS = 1000

/**
 * Mensagens de falha NO MEIO da resposta, quando o stream já começou e a rota
 * não pode mais responder com status e JSON. Chegam ao chat como texto puro —
 * a página mostra só estas, e troca qualquer outra (erro de rede, em inglês,
 * do navegador) pela genérica.
 */
export const PORTAL_ASSISTANT_STREAM_ERRORS = {
  generic: 'Não consegui responder agora. Tente de novo em instantes.',
  providerQuota: 'O assistente atingiu o limite de uso por agora. Tente de novo mais tarde.',
} as const

/**
 * Corpo de `POST /api/portal/<token>/assistente`.
 *
 * Só o texto da pergunta nova: o histórico que o modelo recebe vem do banco
 * (ver `lib/clientPortal/chat.ts`), nunca do navegador.
 */
export interface PortalAssistantRequest {
  /** Id da conversa, gerado pelo chat da página a cada abertura. */
  conversationId: string
  text: string
}

/** 401 do portal. `needs_document` separa "digite seu CPF" de "este link não
 * vale mais" — são telas diferentes, e confundi-las faz o cliente tentar o
 * documento contra um link revogado indefinidamente. */
export interface PortalChallenge {
  needs_document: true
  /** 'cpf' | 'cnpj', para o rótulo e a máscara do campo. */
  document_kind: 'cpf' | 'cnpj'
}
