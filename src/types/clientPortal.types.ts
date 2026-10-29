/**
 * O contrato entre `/api/portal/*` e a página `/acompanhar/<token>`.
 *
 * É deliberadamente MENOR que `LegalProcessWithRelations`: tudo que está aqui
 * é visível a quem tem o link e o documento, então o tipo é a lista do que o
 * escritório aceita mostrar. Campo que não existe aqui não vaza por descuido
 * num `select('*')` — a rota monta o objeto campo a campo.
 *
 * Fora de propósito na v1: documentos, financeiro (além das cobranças por link,
 * ver `PortalPayment`), próxima audiência, partes, responsável interno e
 * qualquer anotação do escritório.
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

/**
 * Uma cobrança como o cliente a vê (migration 67). Só o que tem link: a aberta,
 * com o caminho para pagar, e a paga, com o comprovante. Lançamento sem link,
 * link cancelado, falho ou estornado não aparecem — o portal mostra o que o
 * escritório mandou cobrar, não o contrato inteiro.
 */
export type PortalPayment =
  | {
      id: string
      status: 'open'
      description: string
      amount_cents: number
      /** Vencimento do lançamento; null na condição especial sem previsão. */
      due_date: string | null
      checkout_url: string
    }
  | {
      id: string
      status: 'paid'
      description: string
      /** O que o cliente pagou, juros do parcelamento incluídos. */
      paid_amount_cents: number
      paid_at: string
      capture_method: string | null
      installments: number | null
      receipt_url: string | null
    }

export interface PortalPayload {
  /** Nome de quem está acompanhando, para a página cumprimentar. */
  client_name: string
  processes: PortalProcess[]
  /** `null` quando não deu para carregar: a página avisa, e os processos
   * continuam aparecendo — uma falha nos pagamentos não derruba o portal. */
  payments: PortalPayment[] | null
  generated_at: string
  /** Mostra o chat das perguntas fixas: a IA do portal está ligada no servidor
   * (`PORTAL_ASSISTANT_ENABLED`) e há processo sobre o que responder. */
  answers_enabled: boolean
  /** Como falar com o escritório, do cadastro dele (`office_settings`). `null`
   * sem telefone nem e-mail cadastrados — a página nunca inventa contato. */
  office_contact: PortalOfficeContact | null
}

export interface PortalOfficeContact {
  name: string | null
  phone: string | null
  email: string | null
}

/** 401 do portal. `needs_document` separa "digite seu CPF" de "este link não
 * vale mais" — são telas diferentes, e confundi-las faz o cliente tentar o
 * documento contra um link revogado indefinidamente. */
export interface PortalChallenge {
  needs_document: true
  /** 'cpf' | 'cnpj', para o rótulo e a máscara do campo. */
  document_kind: 'cpf' | 'cnpj'
}
