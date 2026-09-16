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
}

/** Só na emissão: é a única vez que o token existe em claro. */
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
  movements: PortalMovement[]
}

export interface PortalPayload {
  /** Nome de quem está acompanhando, para a página cumprimentar. */
  client_name: string
  processes: PortalProcess[]
  generated_at: string
}

/** 401 do portal. `needs_document` separa "digite seu CPF" de "este link não
 * vale mais" — são telas diferentes, e confundi-las faz o cliente tentar o
 * documento contra um link revogado indefinidamente. */
export interface PortalChallenge {
  needs_document: true
  /** 'cpf' | 'cnpj', para o rótulo e a máscara do campo. */
  document_kind: 'cpf' | 'cnpj'
}
