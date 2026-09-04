// BuscaProcessos API — schema extraído do OpenAPI 3.1 publicado pelo servidor MCP
// (`buscaprocessos://openapi`, BuscaProcessos v2.0.0). Os nomes abaixo vêm da
// spec, não de inferência: a versão anterior deste arquivo modelava
// `partes`/`movimentos`/`tribunal` no topo de `data`, campos que a API nunca
// devolveu — era o que estourava um TypeError na rota de consulta por CNJ.

// ── Envelope ─────────────────────────────────────────────────────────────────

export interface BpMeta {
  creditsRemaining?: number
  creditsCharged?: number
  requestId?: string
  searchLogId?: string | null
  servedAt?: string
}

export interface BpResponse<T> {
  data: T
  meta: BpMeta
}

/** Corpo do HTTP 202: a consulta passou da janela síncrona e continua em
 * processamento. O resultado final sai em `GET /v1/requests/{requestId}`. */
export interface BpPendingData {
  status: 'PROCESSANDO'
  requestId: string
  message?: string
  statusUrl?: string
  pollAfterMs?: number
  submittedAt?: string
}

/** Identificador do job assíncrono devolvido no 202 e aceito por
 * `GET /v1/requests/{requestId}`. */
export type BpRequestId = string

// ── Blocos compartilhados ─────────────────────────────────────────────────────

/** `valor` chega como string decimal ("50000.0000"), não como number. */
export interface BpValorCausa {
  valor: string | null
  moeda: string | null
  valor_formatado: string | null
}

export interface BpTribunal {
  id: number | null
  nome: string | null
  sigla: string | null
  categoria: string | null
}

export interface BpOab {
  uf: string | null
  tipo: string | null
  numero: number | null
}

/** Parte, advogado ou magistrado. `polo` vem em CAIXA ALTA e inclui valores
 * fora do par ativo/passivo: 'ATIVO' | 'PASSIVO' | 'ADVOGADO' | 'NENHUM'. */
export interface BpEnvolvido {
  nome: string
  tipo: string | null
  tipo_normalizado: string | null
  polo: 'ATIVO' | 'PASSIVO' | 'ADVOGADO' | 'NENHUM' | (string & {})
  tipo_pessoa?: 'FISICA' | 'JURIDICA' | (string & {}) | null
  cpf?: string | null
  cnpj?: string | null
  advogados?: BpEnvolvido[]
  oabs?: BpOab[]
}

export interface BpCapa {
  classe: string | null
  assunto: string | null
  area: string | null
  orgao_julgador: string | null
  situacao: string | null
  valor_causa: BpValorCausa | null
  data_distribuicao: string | null
}

/** Cada fonte é um tribunal/grau distinto do mesmo processo (1º grau, 2º grau,
 * diário oficial). A capa e os envolvidos vivem aqui dentro — não no topo. */
export interface BpFonte {
  id: number | null
  processo_fonte_id?: number | null
  descricao: string | null
  nome: string | null
  sigla: string | null
  tipo: string | null
  grau: number | null
  grau_formatado: string | null
  sistema?: string | null
  capa: BpCapa | null
  tribunal: BpTribunal | null
  envolvidos: BpEnvolvido[]
}

// ── GET /v1/processos/cnj/{cnj} — capa ────────────────────────────────────────

/** Capa do processo. Note que NÃO existe `movimentos` aqui: movimentações são
 * um endpoint separado e cobrado à parte (`/movimentacoes`). */
export interface BpProcessoCapa {
  numero_cnj: string
  /** Alias camelCase que a API devolve em paralelo ao snake_case. */
  numeroCnj?: string
  poloAtivo?: string | null
  poloPassivo?: string | null
  titulo_polo_ativo?: string | null
  titulo_polo_passivo?: string | null
  ano_inicio?: number | null
  data_inicio?: string | null
  data_ultima_movimentacao?: string | null
  quantidade_movimentacoes?: number | null
  fontes_tribunais_estao_arquivadas?: boolean | null
  data_ultima_verificacao?: string | null
  valor_causa?: BpValorCausa | null
  valorCausa?: BpValorCausa | null
  processos_relacionados?: Array<{ numero: string }>
  fontes: BpFonte[]
}

export type BpCnjLookupData = BpProcessoCapa

// ── GET /v1/processos/cnj/{cnj}/movimentacoes ─────────────────────────────────

/** A movimentação tem `conteudo`, e não `titulo`. */
export interface BpMovimentacao {
  data: string
  conteudo: string | null
  classificacao_predita: {
    nome?: string | null
    descricao?: string | null
    hierarquia?: string | null
  } | null
  fonte?: { sigla: string | null; grau: string | null } | null
  pagina?: number | null
  /** Preenchido só quando a origem é diário oficial — é o que distingue uma
   * publicação de uma movimentação de serventuário. */
  tipo_publicacao?: string | null
}

export interface BpMovimentacoesData {
  numeroCnj: string
  movimentacoes: BpMovimentacao[]
  total: number
  pagination?: { per_page: number }
  links?: { next: { href: string; cursor: string; li: string } | null }
}

// ── GET /v1/processos/cnj/{cnj}/documentos-publicos ───────────────────────────

/** Referência a um documento no tribunal — não é arquivo nosso. `downloadUrl`
 * aponta para a API e exige a API key; o download é cobrado à parte. */
export interface BpDocumentoPublico {
  id: string
  titulo: string | null
  descricao: string | null
  /** '2024-06-17 18:02:36' — sem fuso declarado pela API. */
  data: string | null
  /** 'PUBLICO' e afins; texto livre da origem. */
  tipo: string | null
  extensaoArquivo: string | null
  quantidadePaginas: number | null
  downloadUrl: string | null
}

export interface BpDocumentosPublicosData {
  numeroCnj: string
  documentos: BpDocumentoPublico[]
  total: number
  pagination?: {
    currentPage: number
    perPage: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// ── GET /v1/processos/cnj/{cnj}/resumo-ia ─────────────────────────────────────

export interface BpResumoIaData {
  numeroCnj: string
  conteudo: string | null
  /** Quando a IA gerou o resumo, do lado deles. */
  atualizadoEm: string | null
  /** true = veio do cache da API; a cobrança acontece de todo jeito. */
  cached?: boolean
  /** 'success' quando o resumo está pronto. */
  state?: string | null
}

// ── GET /v1/processos?cpf_cnpj=… ──────────────────────────────────────────────

export interface BpDocumentSearchData {
  document: string
  documentType: string
  envolvido?: Record<string, unknown>
  processos: BpProcessoCapa[]
  links?: { next?: { href: string } | null }
}

// ── GET /v1/advogados/processos?oab_estado=…&oab_numero=… ─────────────────────
// (não existe `/v1/processos/oab/{oab}`: a inscrição vai partida em UF + número)

/** O resumo por OAB tem forma própria (camelCase, sem `fontes[].capa`) — não
 * reaproveite `BpProcessoCapa` aqui. */
export interface BpOabProcessoResumo {
  numeroCnj: string
  poloAtivo: string | null
  poloPassivo: string | null
  anoInicio: number | null
  classe: string | null
  orgaoJulgador: string | null
  classificacao: string | null
  statusProcessual: string | null
}

export interface BpOabSearchData {
  advogado?: Record<string, unknown>
  processos: BpOabProcessoResumo[]
}

// ── GET /v1/intimacoes?oabs=UF:NÚMERO,… ───────────────────────────────────────

export interface BpOabRef {
  estado: string
  numero: string
}

/** Publicação encontrada em diário oficial pela inscrição na OAB.
 *
 * Note que a íntegra vem em HTML (`conteudoCompletoHtml`) e `conteudo` é só
 * um trecho — os dois campos existem em paralelo. */
export interface BpIntimacao {
  id: string
  oab?: BpOabRef | null
  dataPublicacao: string
  diario?: { nome: string | null; sigla: string | null; estado?: string | null } | null
  processo?: { numeroCnj: string | null; titulo?: string | null } | null
  titulo: string | null
  conteudo: string | null
  conteudoCompletoHtml?: string | null
  pagina?: number | null
  caderno?: string | null
  link?: string | null
}

export interface BpIntimacoesData {
  oabs: BpOabRef[]
  intimacoes: BpIntimacao[]
  total: number
  /** OABs consultadas que ainda não têm monitoramento ativo — elas não
   * retornam nada até serem cadastradas. */
  missingMonitorings?: BpOabRef[]
  filters?: { desde?: string }
  billing?: { billableOabs: number; pricePerOab: number }
}

// ── Monitoramento de intimações por OAB ───────────────────────────────────────

/** Estado do monitoramento de uma inscrição. Sem ele, GET /v1/intimacoes não
 * devolve nada para a OAB — ela volta em `missingMonitorings`. */
export interface BpIntimacaoMonitoramento {
  id: string
  oab: BpOabRef
  /** Termo que a BuscaProcessos procura no diário: "OAB/SP 123456". */
  termo: string | null
  status: 'ACTIVE' | 'INACTIVE' | (string & {})
  webhookUrl: string | null
  criadoEm: string
  atualizadoEm?: string | null
}

/** GET /v1/intimacoes/oab?oab_estado=&oab_numero= — consulta UMA inscrição.
 * A API não expõe listagem geral: o estado e o número são obrigatórios. */
export interface BpIntimacaoOabListData {
  items: BpIntimacaoMonitoramento[]
  pagination?: {
    currentPage: number
    perPage: number
    hasNextPage: boolean
    totalItems: number
  }
}

/** POST /v1/intimacoes/oab — aceita várias inscrições de uma vez.
 *
 * `reused: true` significa que já havia monitoramento ativo: não entra em
 * `billing.billableOabs` e não gera cobrança nova. */
export interface BpIntimacaoMonitoramentoCriado {
  id: string
  estado: string
  numero: string
  termo: string | null
  status: string | null
  callbackEnabled?: boolean
  reused?: boolean
}

export interface BpCreateIntimacaoOabData {
  oabs: BpOabRef[]
  monitoramentos: BpIntimacaoMonitoramentoCriado[]
  callback?: { enabled: boolean; mode: string | null }
  billing?: { billableOabs: number; pricePerNewOab: number }
}

/** DELETE e PUT /v1/intimacoes/oab. Nenhum dos dois cobra. */
export interface BpIntimacaoOabMutationData {
  oab: BpOabRef
  status: string | null
  message?: string | null
  webhookUrl?: string | null
  billing?: { creditsCharged: number }
}

// ── Monitoramentos ────────────────────────────────────────────────────────────

export interface BpMonitoramento {
  id: string
  numeroCnj: string
  numero_cnj?: string
  tribunal: string | null
  frequencia: 'DIARIA' | 'SEMANAL' | 'MENSAL' | (string & {})
  status: string | null
  ativo: boolean
  /** Monitoramento de processo é cobrado por mês enquanto estiver ativo —
   * criar um sem guardar o `id` deixa a cobrança sem meio de cancelamento. */
  valorMensal?: number | null
  moeda?: string | null
  cobranca?: {
    recorrencia: 'MENSAL' | (string & {})
    valorMensal: number | null
    proximoDebitoEm: string | null
    ultimoDebitoEm: string | null
    status: string | null
    observacao?: string | null
  } | null
  criadoEm: string
  atualizadoEm?: string | null
  desativadoEm?: string | null
}

/** A lista vem em `items`, com paginação — não em `monitoramentos`/`total`. */
export interface BpMonitoramentosListData {
  items: BpMonitoramento[]
  pagination: {
    currentPage: number
    perPage: number
    hasNextPage: boolean
    totalItems: number
  }
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

/**
 * ⚠️ O CORPO DO WEBHOOK NÃO TEM A FORMA DOS ENDPOINTS REST.
 *
 * Tudo acima neste arquivo veio do OpenAPI, que descreve `GET /v1/...`. O
 * webhook é outro contrato: o CNJ não está em `numeroCnj`, a movimentação não
 * está em `movimentacao`, e a data vem em 'dd/MM/yyyy'. Modelar o webhook a
 * partir do OpenAPI faz o handler ignorar todo evento real em silêncio — o
 * endpoint responde 200 e nada é gravado.
 *
 * As interfaces abaixo vieram de payloads REAIS recebidos em produção.
 */

/** `movimentacao_nova` — ato num processo monitorado. */
export interface BpWebhookMovimentacaoData {
  event?: string
  processo?: {
    origem?: string | null
    instancia?: string | null
    /** O CNJ. NÃO se chama `numeroCnj` aqui. */
    numero_unico?: string | null
  } | null
  event_data?: {
    /** Id da movimentação na origem. O REST `/movimentacoes` não devolve um. */
    id?: number | string | null
    /** 'dd/MM/yyyy'. */
    data?: string | null
    conteudo?: string | null
  } | null
}

/** Quem aparece na publicação do diário. É o que `publication_parties` espera. */
export interface BpWebhookDiarioEnvolvido {
  nome: string
  /** 'Advogado', 'Requerente', 'Requerido'… texto livre da origem. */
  envolvido_tipo?: string | null
  /** '123456/SP'. */
  oab?: string | null
}

/** `diario_movimentacao_nova` — publicação em diário oficial, do monitoramento
 * por OAB/termo. É PUBLICAÇÃO, não movimentação de processo. */
export interface BpWebhookDiarioData {
  event?: string
  /** Termos que casaram — a OAB ou o nome monitorado. */
  monitoramento?: {
    termo?: string | null
    tipo?: string | null
    descricao?: string | null
    data_ultima_aparicao?: string | null
  }[]
  movimentacao?: {
    /** Id estável na origem — vira o `external_id` da publicação. */
    id?: number | string | null
    secao?: string | null
    /** Rótulo curto do ato ("Despacho de Teste") — vira o `title`. */
    texto_categoria?: string | null
    diario_oficial_id?: number | null
    processo_id?: number | null
    pagina?: number | null
    /** 'Intimação', 'Despacho'… É o que marca a origem como diário. NÃO se
     * chama `tipo_publicacao` aqui. */
    tipo?: string | null
    /** HTML, não texto puro. */
    conteudo?: string | null
    /** 'yyyy-MM-dd HH:mm:ss'. Data da edição do diário. */
    data?: string | null
    /** '26/05/2026 | Diário Oficial Exemplo'. */
    diario_oficial?: string | null
    estado?: string | null
    envolvidos?: BpWebhookDiarioEnvolvido[]
    link?: string | null
    link_pdf?: string | null
    processo?: {
      /** O CNJ. */
      numero_novo?: string | null
      numero_antigo?: string | null
    } | null
  } | null
}

export interface BpWebhookPayload {
  id: string
  event:
    | 'movimentacao_nova'
    | 'diario_movimentacao_nova'
    | 'nova_movimentacao'
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
  /** Cópia literal de `data`, como a origem recebeu do tribunal. Não é lida:
   * o que guardamos para auditoria é o envelope inteiro em `webhook_events`. */
  raw?: Record<string, unknown>
}
