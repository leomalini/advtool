// BuscaProcessos API — https://docs.buscaprocessos.app.br
// NOTE: Field names are modeled from the API docs. Verify against live responses.

// ── Envelope ─────────────────────────────────────────────────────────────────

export interface BpMeta {
  creditsRemaining: number
  creditsCharged?: number
  requestId: string
  searchLogId: string | null
  servedAt: string
}

export interface BpResponse<T> {
  data: T
  meta: BpMeta
}

// ── Domain objects ────────────────────────────────────────────────────────────

/** Party involved in a legal process */
export interface BpParte {
  nome: string
  documento: string | null
  polo: 'ativo' | 'passivo' | (string & {})
  tipo: string | null
}

/** Single movement / court update */
export interface BpMovimento {
  data: string // ISO date string
  titulo: string
  conteudo: string | null
}

/** Normalized process object returned by BuscaProcessos */
export interface BpProcesso {
  numero: string
  tribunal: string | null
  vara: string | null
  classe: string | null
  assunto: string | null
  valor: number | null
  partes: BpParte[]
  movimentos: BpMovimento[]
  dataDistribuicao: string | null
  dataUltimaMovimentacao: string | null
  status: string | null
}

// ── Endpoint-specific data shapes ─────────────────────────────────────────────

/** GET /v1/processos/cnj/{cnj} → data IS the processo directly */
export type BpCnjLookupData = BpProcesso

/** GET /v1/processos?cpf_cnpj=... */
export interface BpDocumentSearchData {
  document: string
  documentType: 'CPF' | 'CNPJ'
  total: number
  processos: BpProcesso[]
  pagination: {
    page: number
    perPage: number
    total: number
  }
  links: {
    next: string | null
  }
}

/** GET /v1/processos/oab/{oab} */
export interface BpOabSearchData {
  oab: string
  total: number
  processos: BpProcesso[]
  pagination: {
    page: number
    perPage: number
    total: number
  }
  links: {
    next: string | null
  }
}

// ── Monitoring ────────────────────────────────────────────────────────────────

export interface BpMonitoramento {
  id: string
  numeroCnj: string
  frequencia: 'DIARIA' | 'SEMANAL' | 'MENSAL'
  webhookUrl: string | null
  status: 'ativo' | 'inativo'
  criadoEm: string
}

export interface BpMonitoramentosListData {
  monitoramentos: BpMonitoramento[]
  total: number
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface BpWebhookPayload {
  id: string
  event:
    | 'nova_movimentacao'
    | 'movimentacao_nova'
    | 'novo_processo'
    | 'novo_processo_envolvido'
    | 'processo_encontrado'
    | 'processo_nao_encontrado'
    | 'resultado_processo_async'
    | 'resultado_busca_oab_async'
    | (string & {})
  source: 'BUSCAPROCESSOS'
  created_at: string
  data: Record<string, unknown>
}
