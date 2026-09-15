// BuscaProcessos API — schema extraído do OpenAPI 3.1 publicado pelo servidor MCP
// (`buscaprocessos://openapi`, BuscaProcessos v2.0.0). Os nomes abaixo vêm da
// spec, não de inferência: a versão anterior deste arquivo modelava
// `partes`/`movimentos`/`tribunal` no topo de `data`, campos que a API nunca
// devolveu — era o que estourava um TypeError na rota de consulta por CNJ.
//
// O bloco de `GET /v1/processos?cpf_cnpj=` e os tipos que ele alcança
// (`BpCapa`, `BpEnvolvido`, `BpTribunal`, `BpProcessoCapa`) foram conferidos
// contra uma RESPOSTA REAL, e não contra a spec: onde os dois discordam, o
// payload observado ganhou, e a divergência está comentada no ponto.

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

/** ⚠️ Em `fontes[].tribunal` isto é um OBJETO; no topo de `BpProcessoCapa` o
 * campo homônimo `tribunal` é uma STRING com a sigla. Não são o mesmo campo.
 *
 * `segmento` e `jtr` vieram de payload real; `id` e `categoria` estavam aqui
 * desde a modelagem pelo OpenAPI e nenhuma resposta observada os trouxe — daí
 * serem opcionais, e não `| null` obrigatórios. */
export interface BpTribunal {
  id?: number | null
  nome: string | null
  sigla: string | null
  categoria?: string | null
  /** 'JUSTICA_ESTADUAL' | 'JUSTICA_FEDERAL' | 'SUPREMO_TRIBUNAL_FEDERAL'… */
  segmento?: string | null
  /** Código JTR do CNJ, como string: '808' (TJES), '402' (TRF2). */
  jtr?: string | null
}

export interface BpOab {
  uf: string | null
  tipo: string | null
  numero: number | null
}

/** A inscrição como ela aparece DENTRO de `envolvidos[].advogados[]`: o par é
 * `numero`/`uf`, e `numero` é string com zeros à esquerda ('0009591'). Não
 * confundir com `BpOab` (uf/tipo/numero numérico), que é outra forma. */
export interface BpAdvogadoOab {
  numero: string | null
  uf: string | null
}

/** Documento de um envolvido na forma tabelada que a busca por CPF/CNPJ traz. */
export interface BpDocumentoEnvolvido {
  numero: string | null
  /** 'CPF' | 'CNPJ'. */
  tipo: string | null
}

/** Advogado vinculado a um envolvido.
 *
 * Tem forma PRÓPRIA — não é um `BpEnvolvido`: não traz `polo` nem `tipo`, e a
 * inscrição vem em `oab` (array de numero/uf), não em `oabs`. */
export interface BpAdvogado {
  nome: string
  oab?: BpAdvogadoOab[]
  cpf?: string | null
  cnpj?: string | null
  tipo_pessoa?: string | null
  documento?: string | null
}

/** Parte, advogado ou magistrado. `polo` vem em CAIXA ALTA e vai muito além do
 * par ativo/passivo: payloads reais trazem também 'OUTROS_PARTICIPANTES' e
 * 'ASSISTENTE_DESINTERESSADO_AMICUS_CURAE'.
 *
 * ⚠️ Na busca por CPF/CNPJ, o documento procurado costuma aparecer aqui como
 * ADVOGADO do processo, e não como parte — quem consome precisa olhar `tipo`
 * antes de tratar a pessoa como titular do processo. */
export interface BpEnvolvido {
  nome: string
  tipo: string | null
  tipo_normalizado?: string | null
  polo:
    | 'ATIVO'
    | 'PASSIVO'
    | 'ADVOGADO'
    | 'NENHUM'
    | 'OUTROS_PARTICIPANTES'
    | 'ASSISTENTE_DESINTERESSADO_AMICUS_CURAE'
    | (string & {})
  tipo_pessoa?: 'FISICA' | 'JURIDICA' | (string & {}) | null
  /** Alias camelCase devolvido em paralelo ao snake_case. */
  tipoPessoa?: string | null
  cpf?: string | null
  cnpj?: string | null
  /** O CPF ou CNPJ já escolhido pela origem — igual a `cpf ?? cnpj`. */
  documento?: string | null
  documentos?: BpDocumentoEnvolvido[]
  advogados?: BpAdvogado[]
  oabs?: BpOab[]
}

/** Último ato conhecido, embutido na própria capa.
 *
 * Vale dinheiro: a busca por CPF/CNPJ já traz a DESCRIÇÃO do último movimento
 * aqui, de graça. Sem isso, o mesmo texto só sairia de
 * `GET /processos/cnj/{cnj}/movimentacoes`, que é cobrado à parte. */
export interface BpUltimoMovimento {
  /** 'yyyy-MM-dd'. */
  data: string | null
  /** 'yyyy-MM-ddTHH:mm:ss', sem fuso declarado. */
  data_hora?: string | null
  descricao: string | null
  /** Código TPU do CNJ; -1 quando a origem não tabelou o ato. */
  codigo?: number | null
}

export interface BpCapa {
  classe: string | null
  assunto: string | null
  area: string | null
  orgao_julgador: string | null
  /** ⚠️ NÃO vem na busca por CPF/CNPJ — lá a capa não tem `situacao`, e quem
   * depende dela para derivar status recebe null. O sinal disponível naquele
   * payload é `ativo`, no topo do processo. */
  situacao?: string | null
  valor_causa: BpValorCausa | null
  data_distribuicao: string | null
  /** Distinta de `data_distribuicao`: um recurso é ajuizado num ano e
   * distribuído noutro. */
  data_ajuizamento?: string | null
  ultimo_movimento?: BpUltimoMovimento | null
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
  /** ⚠️ String com a SIGLA ('TJES'), não o objeto `BpTribunal` — o campo de
   * mesmo nome dentro de `fontes[]` é que é objeto. */
  tribunal?: string | null
  /** 0 = público. Valor maior indica segredo de justiça na origem. */
  nivel_sigilo?: number | null
  /** Sinal de processo em curso na busca por CPF/CNPJ, onde `capa.situacao`
   * não vem. Não é o mesmo que `fontes_tribunais_estao_arquivadas`, que
   * aparece noutros payloads. */
  ativo?: boolean | null
  data_ultima_verificacao?: string | null
  /** Quando a BuscaProcessos viu o processo pela última vez (lado deles). */
  last_seen_at?: string | null
  valor_causa?: BpValorCausa | null
  valorCausa?: BpValorCausa | null
  processos_relacionados?: Array<{ numero: string }>
  fontes: BpFonte[]
  /** Cópia literal do mesmo processo, repetida pela API dentro de cada item.
   * Dobra o tamanho da resposta e não acrescenta nada — descartada antes de
   * gravar o cache. */
  raw?: Record<string, unknown>
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
  /** Página do diário no site do tribunal (ex.: o CDJE do TJSP). Vem null nas
   * movimentações de serventuário e preenchida junto com `tipo_publicacao` —
   * ou seja, acompanha a publicação, não o processo: a API não devolve uma URL
   * dos autos. */
  link_publicacao_tribunal?: string | null
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

/** Quem é o dono do documento consultado, segundo a origem. */
export interface BpEnvolvidoResumo {
  nome: string | null
  tipoPessoa?: 'FISICA' | 'JURIDICA' | (string & {}) | null
  quantidadeProcessos?: number | null
}

export interface BpDocumentSearchPagination {
  current_page: number
  from: number | null
  last_page: number
  per_page: number
  to: number | null
  total: number
}

/** ⚠️ Esta consulta é cobrada POR RESULTADO, não por chamada: um CPF com 27
 * processos custou R$ 3,90 (`meta.creditsCharged`), enquanto a capa de um
 * processo custa R$ 0,12. Como o preço depende de quantos processos a pessoa
 * tem, ele não é previsível antes de consultar — só dá para informar o custo
 * DEPOIS, lendo `meta.creditsCharged`. É o que justifica o cache local. */
export interface BpDocumentSearchData {
  /** Só dígitos, como a API devolve. */
  document: string
  /** 'cpf' | 'cnpj' — minúsculo. */
  documentType: string
  envolvido?: BpEnvolvidoResumo
  processos: BpProcessoCapa[]
  total: number
  pagination?: BpDocumentSearchPagination
  links?: { next?: { href: string } | null }
  query?: {
    limit?: number | null
    page?: number | null
    cursor?: string | null
    li?: string | null
  }
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
    diario_oficial_id?: number | string | null
    /** ⚠️ Vem com o CNJ, não com um id, nas entregas reais. */
    processo_id?: number | string | null
    /** O CNJ. É aqui que o número está nas entregas reais — o objeto `processo`
     * abaixo não vem. */
    numero_processo?: string | null
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
    /** ⚠️ NÃO é a publicação: aponta para a API da BuscaProcessos e exige a
     * chave. Aberto no navegador responde `API_KEY_REQUIRED`. */
    link?: string | null
    /** O mesmo endereço de `link`, com o nome honesto. */
    link_api?: string | null
    link_pdf?: string | null
    /** A página pública no tribunal — é este o link que a tela pode abrir. */
    link_publicacao_tribunal?: string | null
    processo?: {
      /** O CNJ. */
      numero_novo?: string | null
      numero_antigo?: string | null
    } | null
  } | null
}

export interface BpWebhookPayload {
  /** ⚠️ O ENVELOPE REAL É PLANO — `data` não existe.
   *
   * As entregas registradas em `webhook_events` (`diario_movimentacao_nova`,
   * `processo_verificado`, `atualizacao_processo_concluida`) trazem `event` no
   * topo e o conteúdo ao lado dele: `movimentacao`, `monitoramento`, `processo`,
   * `event_data`, `app`. Nenhuma delas tem `data`, `source`, `created_at` nem
   * `id` — por isso só `event` é obrigatório aqui.
   *
   * O handler lê `payload.data ?? payload`. Exigir o envelope mandava TODA
   * entrega real para `ignored`, com HTTP 200 e sem erro em lugar nenhum. */
  id?: string
  /** Como a origem identifica o evento de fato: 'own-process:116441034:…'. */
  uuid?: string
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
  source?: 'BUSCAPROCESSOS'
  created_at?: string
  /** Só numa reentrega manual do formato documentado. Ver o aviso acima. */
  data?: Record<string, unknown>
  /** Cópia literal de `data`, como a origem recebeu do tribunal. Não é lida:
   * o que guardamos para auditoria é o envelope inteiro em `webhook_events`. */
  raw?: Record<string, unknown>
}
