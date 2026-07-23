// ============================================================
// MOCK DATA — MVP de apresentação do escritório de advocacia
// ============================================================

// ----- TIPOS -----------------------------------------------

export type AreaJuridica =
  | 'trabalhista'
  | 'civel'
  | 'familia'
  | 'tributario'
  | 'criminal'
  | 'previdenciario'
  | 'consumidor'

export type EtiquetaId =
  | 'urgente'
  | 'prazo-fatal'
  | 'audiencia'
  | 'aguardando-cliente'
  | 'prioridade-alta'
  | 'recurso'
  | 'acordo'
  | 'novo'

export interface Etiqueta {
  id: EtiquetaId
  label: string
  color: string // tailwind bg class
  textColor: string // tailwind text class
}

export interface Cliente {
  id: string
  nome: string
  tipo: 'pf' | 'pj'
  cpfCnpj: string
  email: string
  telefone: string
  areaJuridica: AreaJuridica
  endereco: {
    rua: string
    numero: string
    bairro: string
    cidade: string
    estado: string
    cep: string
  }
  totalCasos: number
  casosAtivos: number
  criadoEm: string
  ultimaAtualizacao: string
  observacoes: string
}

export interface Advogado {
  id: string
  nome: string
  email: string
  oab: string
  avatar?: string
  iniciais: string
  cor: string
}

export interface TimelineItem {
  id: string
  tipo:
    | 'caso_criado'
    | 'cliente_atualizado'
    | 'documento_anexado'
    | 'comentario'
    | 'audiencia_criada'
    | 'prazo_criado'
    | 'tarefa_criada'
    | 'tarefa_concluida'
    | 'mudanca_coluna'
    | 'mudanca_workflow'
    | 'movimentacao_processo'
    | 'peticao_enviada'
    | 'acordo_proposto'
  titulo: string
  descricao: string
  autor: string
  autorIniciais: string
  autorCor: string
  data: string
  metadados?: Record<string, string>
}

export interface Tarefa {
  id: string
  titulo: string
  descricao: string
  responsavel: string
  responsavelIniciais: string
  prazo: string
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  status: 'a_fazer' | 'em_andamento' | 'aguardando' | 'concluida'
  checklist: { id: string; texto: string; concluido: boolean }[]
  casoId?: string
  clienteId?: string
  etiquetas: string[]
  criadoEm: string
}

export interface Evento {
  id: string
  titulo: string
  tipo: 'audiencia' | 'reuniao' | 'prazo' | 'compromisso'
  data: string
  hora: string
  horaFim?: string
  local?: string
  descricao: string
  casoId?: string
  clienteId?: string
  responsavel: string
  responsavelIniciais: string
  isFatalPrazo: boolean
  isUrgente: boolean
}

export interface Documento {
  id: string
  nome: string
  tipo: string // extensão
  tamanho: string
  categoria: 'peticao' | 'contrato' | 'procuracao' | 'decisao' | 'outros'
  casoId?: string
  clienteId?: string
  uploadPor: string
  data: string
  url: string
}

export interface MovimentacaoFinanceira {
  id: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  status: 'pago' | 'pendente' | 'atrasado'
  vencimento: string
  casoId?: string
  clienteId?: string
  categoria: 'honorario' | 'custas' | 'pericia' | 'outros'
}

export interface Caso {
  id: string
  clienteId: string
  clienteNome: string
  clienteTelefone: string
  clienteEmail: string
  areaJuridica: AreaJuridica
  advogadoId: string
  advogadoNome: string
  workflowId: string
  colunaId: string
  position: number
  etiquetas: EtiquetaId[]
  proximoPrazo: string | null
  proximaTarefa: string | null
  ultimaAtualizacao: string
  criadoEm: string
  numeroCNJ: string | null
  tribunal: string | null
  vara: string | null
  observacoes: string
  timeline: TimelineItem[]
  tarefas: Tarefa[]
  eventos: Evento[]
  documentos: Documento[]
  financeiro: MovimentacaoFinanceira[]
  partes?: {
    requerente: string
    requerido: string
    advogadoContrario?: string
  }
}

// ----- CONSTANTES ------------------------------------------

export const AREAS_JURIDICAS: Record<AreaJuridica, { label: string; color: string; bg: string; accent: string }> = {
  trabalhista: { label: 'Trabalhista', accent: '#6b8afd', bg: 'bg-[#eef0fe] dark:bg-[rgba(107,138,253,.12)]', color: 'text-[#3a4fd0] dark:text-[#93b1ff]' },
  civel: { label: 'Cível', accent: '#b07cf0', bg: 'bg-[#f2edfd] dark:bg-[rgba(176,124,240,.12)]', color: 'text-[#7048c8] dark:text-[#c9a4f5]' },
  familia: { label: 'Família', accent: '#ec6ead', bg: 'bg-[#fbeaf3] dark:bg-[rgba(236,110,173,.12)]', color: 'text-[#c23b83] dark:text-[#f7a8d0]' },
  tributario: { label: 'Tributário', accent: '#f5b544', bg: 'bg-[#fcf3e3] dark:bg-[rgba(245,181,68,.12)]', color: 'text-[#b0730f] dark:text-[#f5cf8a]' },
  criminal: { label: 'Criminal', accent: '#f2657a', bg: 'bg-[#fdeaec] dark:bg-[rgba(242,101,122,.12)]', color: 'text-[#c23c4c] dark:text-[#f7a3b1]' },
  previdenciario: { label: 'Previdenciário', accent: '#38bdf8', bg: 'bg-[#e3f2fb] dark:bg-[rgba(56,189,248,.12)]', color: 'text-[#1a7fb8] dark:text-[#7fd0f5]' },
  consumidor: { label: 'Consumidor', accent: '#3ecf8e', bg: 'bg-[#eafaf2] dark:bg-[rgba(62,207,142,.12)]', color: 'text-[#0c8a5d] dark:text-[#7fe0b4]' },
}

export const ETIQUETAS: Record<EtiquetaId, Etiqueta> = {
  urgente: { id: 'urgente', label: 'Urgente', color: 'bg-[#fdeaec] dark:bg-[rgba(242,101,122,.14)]', textColor: 'text-[#c23c4c] dark:text-[#ff8a9b]' },
  'prazo-fatal': { id: 'prazo-fatal', label: 'Prazo Fatal', color: 'bg-[#fdeaec] dark:bg-[rgba(242,101,122,.14)]', textColor: 'text-[#c23c4c] dark:text-[#ff8a9b]' },
  audiencia: { id: 'audiencia', label: 'Audiência', color: 'bg-[#eef0fe] dark:bg-[rgba(107,138,253,.12)]', textColor: 'text-[#3a4fd0] dark:text-[#93b1ff]' },
  'aguardando-cliente': { id: 'aguardando-cliente', label: 'Aguardando Cliente', color: 'bg-[#fcf3e3] dark:bg-[rgba(245,181,68,.12)]', textColor: 'text-[#b0730f] dark:text-[#f5cf8a]' },
  'prioridade-alta': { id: 'prioridade-alta', label: 'Prioridade Alta', color: 'bg-[#fdeaec] dark:bg-[rgba(242,101,122,.14)]', textColor: 'text-[#c23c4c] dark:text-[#ff8a9b]' },
  recurso: { id: 'recurso', label: 'Recurso', color: 'bg-[#f2edfd] dark:bg-[rgba(176,124,240,.12)]', textColor: 'text-[#7048c8] dark:text-[#c9a4f5]' },
  acordo: { id: 'acordo', label: 'Acordo', color: 'bg-[#eafaf2] dark:bg-[rgba(62,207,142,.12)]', textColor: 'text-[#0c8a5d] dark:text-[#7fe0b4]' },
  novo: { id: 'novo', label: 'Novo', color: 'bg-[#e3f2fb] dark:bg-[rgba(56,189,248,.12)]', textColor: 'text-[#1a7fb8] dark:text-[#7fd0f5]' },
}

// ----- ADVOGADOS -------------------------------------------

export const ADVOGADOS: Advogado[] = [
  {
    id: 'adv-1',
    nome: 'Dra. Ana Souza',
    email: 'ana@escritorio.adv.br',
    oab: 'OAB/SP 123.456',
    iniciais: 'AS',
    cor: 'bg-violet-500',
  },
  {
    id: 'adv-2',
    nome: 'Dr. Ricardo Lima',
    email: 'ricardo@escritorio.adv.br',
    oab: 'OAB/SP 789.012',
    iniciais: 'RL',
    cor: 'bg-cyan-500',
  },
]

// ----- CLIENTES --------------------------------------------

export const CLIENTES: Cliente[] = [
  {
    id: 'cli-1',
    nome: 'Maria Aparecida Silva',
    tipo: 'pf',
    cpfCnpj: '372.846.920-11',
    email: 'maria.silva@gmail.com',
    telefone: '(11) 99234-5678',
    areaJuridica: 'trabalhista',
    endereco: {
      rua: 'Rua das Flores',
      numero: '123',
      bairro: 'Jardim Paulista',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01403-001',
    },
    totalCasos: 2,
    casosAtivos: 1,
    criadoEm: '2024-03-15',
    ultimaAtualizacao: '2026-06-28',
    observacoes: 'Cliente desde 2024. Pontual com documentos. Prefere contato por WhatsApp.',
  },
  {
    id: 'cli-2',
    nome: 'João Carlos Pereira',
    tipo: 'pf',
    cpfCnpj: '521.739.840-33',
    email: 'joao.pereira@hotmail.com',
    telefone: '(11) 98567-3421',
    areaJuridica: 'civel',
    endereco: {
      rua: 'Av. Paulista',
      numero: '2000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01310-100',
    },
    totalCasos: 3,
    casosAtivos: 2,
    criadoEm: '2024-01-10',
    ultimaAtualizacao: '2026-06-25',
    observacoes: 'Indicação do Dr. Marcos. Caso complexo de danos morais.',
  },
  {
    id: 'cli-3',
    nome: 'Ana Paula Costa',
    tipo: 'pf',
    cpfCnpj: '183.920.560-72',
    email: 'ana.costa@outlook.com',
    telefone: '(11) 97123-8891',
    areaJuridica: 'familia',
    endereco: {
      rua: 'Rua Augusta',
      numero: '456',
      bairro: 'Consolação',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01304-000',
    },
    totalCasos: 1,
    casosAtivos: 1,
    criadoEm: '2026-01-20',
    ultimaAtualizacao: '2026-06-29',
    observacoes: 'Processo de divórcio com guarda disputada. Situação sensível.',
  },
  {
    id: 'cli-4',
    nome: 'TechVision Sistemas Ltda',
    tipo: 'pj',
    cpfCnpj: '12.345.678/0001-90',
    email: 'juridico@techvision.com.br',
    telefone: '(11) 3456-7890',
    areaJuridica: 'tributario',
    endereco: {
      rua: 'Rua Faria Lima',
      numero: '3500',
      bairro: 'Itaim Bibi',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '04538-132',
    },
    totalCasos: 4,
    casosAtivos: 3,
    criadoEm: '2023-11-05',
    ultimaAtualizacao: '2026-06-27',
    observacoes: 'Cliente corporativo. Contato principal: Dra. Fernanda Ramos (diretora jurídica).',
  },
  {
    id: 'cli-5',
    nome: 'Carlos Eduardo Mendes',
    tipo: 'pf',
    cpfCnpj: '672.018.430-55',
    email: 'carlosmendes@gmail.com',
    telefone: '(11) 96789-1234',
    areaJuridica: 'previdenciario',
    endereco: {
      rua: 'Rua Dr. Vila Nova',
      numero: '89',
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '04111-020',
    },
    totalCasos: 1,
    casosAtivos: 1,
    criadoEm: '2026-02-14',
    ultimaAtualizacao: '2026-06-20',
    observacoes: 'Aposentadoria por invalidez. Documentação médica em análise.',
  },
]

// ----- CASOS -----------------------------------------------

export const CASOS: Caso[] = [
  // ---- NEGOCIAÇÃO ----
  {
    id: 'caso-001',
    clienteId: 'cli-1',
    clienteNome: 'Maria Aparecida Silva',
    clienteTelefone: '(11) 99234-5678',
    clienteEmail: 'maria.silva@gmail.com',
    areaJuridica: 'trabalhista',
    advogadoId: 'adv-1',
    advogadoNome: 'Dra. Ana Souza',
    workflowId: 'wf-negociacao',
    colunaId: 'neg-1',
    position: 0,
    etiquetas: ['novo', 'aguardando-cliente'],
    proximoPrazo: '2026-07-10',
    proximaTarefa: 'Solicitar CTPS e contracheques',
    ultimaAtualizacao: '2026-06-29T14:30:00',
    criadoEm: '2026-06-28T09:00:00',
    numeroCNJ: null,
    tribunal: null,
    vara: null,
    observacoes: 'Demissão sem justa causa após 8 anos de empresa. FGTS não recolhido corretamente. Empregada doméstica com possível vínculo empregatício informal.',
    partes: undefined,
    timeline: [
      {
        id: 'tl-001-1',
        tipo: 'caso_criado',
        titulo: 'Caso criado',
        descricao: 'Caso registrado no sistema após primeiro atendimento',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-28T09:00:00',
      },
      {
        id: 'tl-001-2',
        tipo: 'comentario',
        titulo: 'Nota interna',
        descricao: 'Cliente relatou que não recebeu aviso prévio e o FGTS não foi depositado nos últimos 3 anos. Precisa reunir documentação.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-28T09:15:00',
      },
      {
        id: 'tl-001-3',
        tipo: 'tarefa_criada',
        titulo: 'Tarefa criada',
        descricao: 'Solicitar CTPS, contracheques e extrato FGTS',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-29T10:00:00',
      },
    ],
    tarefas: [
      {
        id: 'tar-001-1',
        titulo: 'Solicitar CTPS e contracheques',
        descricao: 'Pedir à cliente a CTPS, últimos 6 contracheques e extrato do FGTS dos últimos 5 anos.',
        responsavel: 'Dra. Ana Souza',
        responsavelIniciais: 'AS',
        prazo: '2026-07-10',
        prioridade: 'alta',
        status: 'a_fazer',
        checklist: [
          { id: 'c1', texto: 'CTPS física ou digital', concluido: false },
          { id: 'c2', texto: 'Contracheques (últimos 6 meses)', concluido: false },
          { id: 'c3', texto: 'Extrato FGTS', concluido: false },
          { id: 'c4', texto: 'Termo de rescisão (se houver)', concluido: false },
        ],
        etiquetas: ['urgente'],
        casoId: 'caso-001',
        clienteId: 'cli-1',
        criadoEm: '2026-06-29T10:00:00',
      },
    ],
    eventos: [],
    documentos: [],
    financeiro: [],
  },
  {
    id: 'caso-002',
    clienteId: 'cli-2',
    clienteNome: 'João Carlos Pereira',
    clienteTelefone: '(11) 98567-3421',
    clienteEmail: 'joao.pereira@hotmail.com',
    areaJuridica: 'civel',
    advogadoId: 'adv-2',
    advogadoNome: 'Dr. Ricardo Lima',
    workflowId: 'wf-negociacao',
    colunaId: 'neg-3',
    position: 0,
    etiquetas: ['prioridade-alta'],
    proximoPrazo: '2026-07-15',
    proximaTarefa: 'Elaborar parecer jurídico',
    ultimaAtualizacao: '2026-06-27T16:00:00',
    criadoEm: '2026-06-20T10:00:00',
    numeroCNJ: null,
    tribunal: null,
    vara: null,
    observacoes: 'Acidente de trânsito com danos materiais e morais. Motorista de aplicativo causou o acidente. Seguradora se recusa a pagar.',
    partes: {
      requerente: 'João Carlos Pereira',
      requerido: 'Seguradora BrasilSeg S.A.',
      advogadoContrario: 'Dr. Fábio Augusto (OAB/SP 234.567)',
    },
    timeline: [
      {
        id: 'tl-002-1',
        tipo: 'caso_criado',
        titulo: 'Caso criado',
        descricao: 'Caso registrado após consulta inicial',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-06-20T10:00:00',
      },
      {
        id: 'tl-002-2',
        tipo: 'documento_anexado',
        titulo: 'Documento anexado',
        descricao: 'Boletim de ocorrência do acidente anexado ao caso',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-06-22T11:30:00',
      },
      {
        id: 'tl-002-3',
        tipo: 'mudanca_coluna',
        titulo: 'Etapa atualizada',
        descricao: 'Movido de "Aguardando Documentos" para "Análise Jurídica"',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-06-27T16:00:00',
      },
    ],
    tarefas: [
      {
        id: 'tar-002-1',
        titulo: 'Elaborar parecer jurídico',
        descricao: 'Analisar responsabilidade da seguradora e embasar pedido de danos morais e materiais.',
        responsavel: 'Dr. Ricardo Lima',
        responsavelIniciais: 'RL',
        prazo: '2026-07-15',
        prioridade: 'alta',
        status: 'em_andamento',
        checklist: [
          { id: 'c1', texto: 'Analisar apólice de seguro', concluido: true },
          { id: 'c2', texto: 'Pesquisar jurisprudência', concluido: false },
          { id: 'c3', texto: 'Calcular danos materiais', concluido: false },
          { id: 'c4', texto: 'Redigir parecer', concluido: false },
        ],
        etiquetas: [],
        casoId: 'caso-002',
        clienteId: 'cli-2',
        criadoEm: '2026-06-20T10:30:00',
      },
    ],
    eventos: [],
    documentos: [
      {
        id: 'doc-002-1',
        nome: 'Boletim de Ocorrência.pdf',
        tipo: 'pdf',
        tamanho: '2.4 MB',
        categoria: 'outros',
        casoId: 'caso-002',
        clienteId: 'cli-2',
        uploadPor: 'Dr. Ricardo Lima',
        data: '2026-06-22',
        url: '#',
      },
      {
        id: 'doc-002-2',
        nome: 'Fotos do Acidente.zip',
        tipo: 'zip',
        tamanho: '18.2 MB',
        categoria: 'outros',
        casoId: 'caso-002',
        clienteId: 'cli-2',
        uploadPor: 'Dr. Ricardo Lima',
        data: '2026-06-22',
        url: '#',
      },
    ],
    financeiro: [
      {
        id: 'fin-002-1',
        tipo: 'receita',
        descricao: 'Honorários — entrada inicial',
        valor: 3500,
        status: 'pago',
        vencimento: '2026-06-25',
        casoId: 'caso-002',
        clienteId: 'cli-2',
        categoria: 'honorario',
      },
    ],
  },
  {
    id: 'caso-003',
    clienteId: 'cli-4',
    clienteNome: 'TechVision Sistemas Ltda',
    clienteTelefone: '(11) 3456-7890',
    clienteEmail: 'juridico@techvision.com.br',
    areaJuridica: 'tributario',
    advogadoId: 'adv-1',
    advogadoNome: 'Dra. Ana Souza',
    workflowId: 'wf-negociacao',
    colunaId: 'neg-5',
    position: 0,
    etiquetas: ['acordo', 'prioridade-alta'],
    proximoPrazo: '2026-07-05',
    proximaTarefa: 'Reunião para apresentação da proposta',
    ultimaAtualizacao: '2026-06-26T09:00:00',
    criadoEm: '2026-06-01T08:00:00',
    numeroCNJ: null,
    tribunal: null,
    vara: null,
    observacoes: 'Discussão de autuação fiscal — ICMS sobre software SaaS. Valor total: R$ 1.2M. Alta chance de êxito com base em jurisprudência recente do STJ.',
    partes: undefined,
    timeline: [
      {
        id: 'tl-003-1',
        tipo: 'caso_criado',
        titulo: 'Caso criado',
        descricao: 'Autuação fiscal recebida. Cliente solicita análise.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-01T08:00:00',
      },
      {
        id: 'tl-003-2',
        tipo: 'peticao_enviada',
        titulo: 'Impugnação administrativa protocolada',
        descricao: 'Impugnação à autuação protocolada na SEFAZ com base em Lei Complementar 116.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-10T14:00:00',
      },
      {
        id: 'tl-003-3',
        tipo: 'acordo_proposto',
        titulo: 'Proposta de acordo enviada',
        descricao: 'Proposta de parcelamento com 60% de desconto em multas e juros encaminhada à Procuradoria.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-06-26T09:00:00',
      },
    ],
    tarefas: [],
    eventos: [
      {
        id: 'ev-003-1',
        titulo: 'Reunião — Apresentação da Proposta',
        tipo: 'reuniao',
        data: '2026-07-05',
        hora: '10:00',
        horaFim: '11:30',
        local: 'Escritório — Sala de Reuniões',
        descricao: 'Apresentar proposta de acordo tributário para diretoria da TechVision.',
        casoId: 'caso-003',
        clienteId: 'cli-4',
        responsavel: 'Dra. Ana Souza',
        responsavelIniciais: 'AS',
        isFatalPrazo: false,
        isUrgente: false,
      },
    ],
    documentos: [],
    financeiro: [
      {
        id: 'fin-003-1',
        tipo: 'receita',
        descricao: 'Honorários — fase administrativa',
        valor: 15000,
        status: 'pago',
        vencimento: '2026-06-10',
        casoId: 'caso-003',
        clienteId: 'cli-4',
        categoria: 'honorario',
      },
      {
        id: 'fin-003-2',
        tipo: 'receita',
        descricao: 'Honorários — êxito (10% da economia)',
        valor: 120000,
        status: 'pendente',
        vencimento: '2026-09-01',
        casoId: 'caso-003',
        clienteId: 'cli-4',
        categoria: 'honorario',
      },
    ],
  },
  {
    id: 'caso-004',
    clienteId: 'cli-3',
    clienteNome: 'Ana Paula Costa',
    clienteTelefone: '(11) 97123-8891',
    clienteEmail: 'ana.costa@outlook.com',
    areaJuridica: 'familia',
    advogadoId: 'adv-2',
    advogadoNome: 'Dr. Ricardo Lima',
    workflowId: 'wf-negociacao',
    colunaId: 'neg-6',
    position: 0,
    etiquetas: ['urgente', 'audiencia'],
    proximoPrazo: '2026-07-03',
    proximaTarefa: 'Preparar memoriais para audiência',
    ultimaAtualizacao: '2026-06-29T11:00:00',
    criadoEm: '2026-02-10T09:00:00',
    numeroCNJ: '1023456-78.2026.8.26.0100',
    tribunal: 'TJSP',
    vara: '3ª Vara de Família e Sucessões',
    observacoes: 'Divórcio litigioso com disputa de guarda de 2 filhos menores. Pedido de alimentos provisórios deferido. Audiência marcada.',
    partes: {
      requerente: 'Ana Paula Costa',
      requerido: 'Roberto Costa',
      advogadoContrario: 'Dra. Patricia Moura (OAB/SP 345.678)',
    },
    timeline: [
      {
        id: 'tl-004-1',
        tipo: 'caso_criado',
        titulo: 'Caso criado',
        descricao: 'Caso de divórcio registrado. Situação urgente — ameaças relatadas.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-02-10T09:00:00',
      },
      {
        id: 'tl-004-2',
        tipo: 'peticao_enviada',
        titulo: 'Petição inicial protocolada',
        descricao: 'Ação de divórcio c/c guarda, alimentos e partilha distribuída na 3ª Vara de Família.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-02-15T14:00:00',
      },
      {
        id: 'tl-004-3',
        tipo: 'movimentacao_processo',
        titulo: 'Decisão interlocutória',
        descricao: 'Alimentos provisórios fixados em 30% dos rendimentos do réu. Guarda provisória concedida à autora.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-03-01T10:00:00',
      },
      {
        id: 'tl-004-4',
        tipo: 'audiencia_criada',
        titulo: 'Audiência de conciliação agendada',
        descricao: 'Audiência marcada para 03/07/2026 às 09h — 3ª Vara de Família.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-06-29T11:00:00',
      },
    ],
    tarefas: [
      {
        id: 'tar-004-1',
        titulo: 'Preparar memoriais para audiência',
        descricao: 'Redigir memoriais com argumentos sobre guarda compartilhada e revisão de alimentos.',
        responsavel: 'Dr. Ricardo Lima',
        responsavelIniciais: 'RL',
        prazo: '2026-07-02',
        prioridade: 'urgente',
        status: 'em_andamento',
        checklist: [
          { id: 'c1', texto: 'Resumir depoimentos da instrução', concluido: true },
          { id: 'c2', texto: 'Pesquisar jurisprudência guarda', concluido: true },
          { id: 'c3', texto: 'Redigir memorial autora', concluido: false },
          { id: 'c4', texto: 'Revisar cálculo de alimentos', concluido: false },
        ],
        etiquetas: ['urgente'],
        casoId: 'caso-004',
        clienteId: 'cli-3',
        criadoEm: '2026-06-29T11:30:00',
      },
    ],
    eventos: [
      {
        id: 'ev-004-1',
        titulo: 'Audiência de Conciliação — Costa x Costa',
        tipo: 'audiencia',
        data: '2026-07-03',
        hora: '09:00',
        horaFim: '10:30',
        local: 'TJSP — Fórum João Mendes Jr., Sala 302',
        descricao: 'Audiência de conciliação no processo de divórcio. Levar memoriais e documentos de renda.',
        casoId: 'caso-004',
        clienteId: 'cli-3',
        responsavel: 'Dr. Ricardo Lima',
        responsavelIniciais: 'RL',
        isFatalPrazo: false,
        isUrgente: true,
      },
    ],
    documentos: [
      {
        id: 'doc-004-1',
        nome: 'Petição Inicial — Divórcio Costa.pdf',
        tipo: 'pdf',
        tamanho: '456 KB',
        categoria: 'peticao',
        casoId: 'caso-004',
        clienteId: 'cli-3',
        uploadPor: 'Dr. Ricardo Lima',
        data: '2026-02-15',
        url: '#',
      },
      {
        id: 'doc-004-2',
        nome: 'Decisão — Alimentos Provisórios.pdf',
        tipo: 'pdf',
        tamanho: '128 KB',
        categoria: 'decisao',
        casoId: 'caso-004',
        clienteId: 'cli-3',
        uploadPor: 'Dr. Ricardo Lima',
        data: '2026-03-01',
        url: '#',
      },
    ],
    financeiro: [
      {
        id: 'fin-004-1',
        tipo: 'receita',
        descricao: 'Honorários contratuais',
        valor: 8000,
        status: 'pago',
        vencimento: '2026-02-20',
        casoId: 'caso-004',
        clienteId: 'cli-3',
        categoria: 'honorario',
      },
      {
        id: 'fin-004-2',
        tipo: 'despesa',
        descricao: 'Custas judiciais — distribuição',
        valor: 892,
        status: 'pago',
        vencimento: '2026-02-15',
        casoId: 'caso-004',
        clienteId: 'cli-3',
        categoria: 'custas',
      },
    ],
  },

  // ---- PROCESSOS ----
  {
    id: 'caso-005',
    clienteId: 'cli-1',
    clienteNome: 'Maria Aparecida Silva',
    clienteTelefone: '(11) 99234-5678',
    clienteEmail: 'maria.silva@gmail.com',
    areaJuridica: 'trabalhista',
    advogadoId: 'adv-1',
    advogadoNome: 'Dra. Ana Souza',
    workflowId: 'wf-processos',
    colunaId: 'proc-4',
    position: 0,
    etiquetas: ['prazo-fatal', 'audiencia'],
    proximoPrazo: '2026-07-08',
    proximaTarefa: 'Apresentar rol de testemunhas',
    ultimaAtualizacao: '2026-06-28T15:00:00',
    criadoEm: '2024-04-01T09:00:00',
    numeroCNJ: '0012345-67.2024.5.02.0001',
    tribunal: 'TRT-2',
    vara: '1ª Vara do Trabalho de São Paulo',
    observacoes: 'Ação trabalhista por verbas rescisórias (saldo de salário, aviso prévio, 13º, férias+1/3, FGTS+40%). Empresa: Constrói Bem Engenharia Ltda.',
    partes: {
      requerente: 'Maria Aparecida Silva',
      requerido: 'Constrói Bem Engenharia Ltda.',
      advogadoContrario: 'Dr. André Campos (OAB/SP 456.789)',
    },
    timeline: [
      {
        id: 'tl-005-1',
        tipo: 'caso_criado',
        titulo: 'Processo cadastrado',
        descricao: 'Ação trabalhista distribuída e cadastrada no sistema.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2024-04-01T09:00:00',
      },
      {
        id: 'tl-005-2',
        tipo: 'movimentacao_processo',
        titulo: 'Citação realizada',
        descricao: 'Empresa reclamada citada e prazo para apresentação de defesa iniciado.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2024-04-20T10:00:00',
      },
      {
        id: 'tl-005-3',
        tipo: 'movimentacao_processo',
        titulo: 'Defesa apresentada',
        descricao: 'Empresa apresentou contestação negando todos os pedidos.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2024-05-10T14:00:00',
      },
      {
        id: 'tl-005-4',
        tipo: 'audiencia_criada',
        titulo: 'Audiência de instrução designada',
        descricao: 'Audiência de instrução marcada para 15/07/2026.',
        autor: 'Sistema',
        autorIniciais: 'SY',
        autorCor: 'bg-slate-500',
        data: '2026-06-28T15:00:00',
      },
    ],
    tarefas: [
      {
        id: 'tar-005-1',
        titulo: 'Apresentar rol de testemunhas',
        descricao: 'Protocolar rol com 3 testemunhas até 08/07/2026 (prazo fatal).',
        responsavel: 'Dra. Ana Souza',
        responsavelIniciais: 'AS',
        prazo: '2026-07-08',
        prioridade: 'urgente',
        status: 'a_fazer',
        checklist: [
          { id: 'c1', texto: 'Contatar testemunhas', concluido: false },
          { id: 'c2', texto: 'Obter dados pessoais das testemunhas', concluido: false },
          { id: 'c3', texto: 'Protocolar rol no sistema e-Proc', concluido: false },
        ],
        etiquetas: ['prazo-fatal'],
        casoId: 'caso-005',
        clienteId: 'cli-1',
        criadoEm: '2026-06-28T15:30:00',
      },
    ],
    eventos: [
      {
        id: 'ev-005-1',
        titulo: 'Prazo Fatal — Rol de Testemunhas',
        tipo: 'prazo',
        data: '2026-07-08',
        hora: '23:59',
        descricao: 'Prazo final para protocolar rol de testemunhas na ação trabalhista. NÃO pode ser prorrogado.',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        responsavel: 'Dra. Ana Souza',
        responsavelIniciais: 'AS',
        isFatalPrazo: true,
        isUrgente: true,
      },
      {
        id: 'ev-005-2',
        titulo: 'Audiência de Instrução — Silva x Constrói Bem',
        tipo: 'audiencia',
        data: '2026-07-15',
        hora: '14:00',
        horaFim: '16:00',
        local: 'TRT-2 — Sala 5A',
        descricao: 'Audiência de instrução para oitiva de testemunhas.',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        responsavel: 'Dra. Ana Souza',
        responsavelIniciais: 'AS',
        isFatalPrazo: false,
        isUrgente: false,
      },
    ],
    documentos: [
      {
        id: 'doc-005-1',
        nome: 'Reclamação Trabalhista.pdf',
        tipo: 'pdf',
        tamanho: '312 KB',
        categoria: 'peticao',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        uploadPor: 'Dra. Ana Souza',
        data: '2024-04-01',
        url: '#',
      },
      {
        id: 'doc-005-2',
        nome: 'Contestação da Empresa.pdf',
        tipo: 'pdf',
        tamanho: '520 KB',
        categoria: 'outros',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        uploadPor: 'Dra. Ana Souza',
        data: '2024-05-10',
        url: '#',
      },
      {
        id: 'doc-005-3',
        nome: 'Procuração — Maria Silva.pdf',
        tipo: 'pdf',
        tamanho: '98 KB',
        categoria: 'procuracao',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        uploadPor: 'Dra. Ana Souza',
        data: '2024-03-30',
        url: '#',
      },
    ],
    financeiro: [
      {
        id: 'fin-005-1',
        tipo: 'receita',
        descricao: 'Honorários contratuais — entrada',
        valor: 2000,
        status: 'pago',
        vencimento: '2024-04-05',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        categoria: 'honorario',
      },
      {
        id: 'fin-005-2',
        tipo: 'despesa',
        descricao: 'Custas de distribuição',
        valor: 450,
        status: 'pago',
        vencimento: '2024-04-01',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        categoria: 'custas',
      },
      {
        id: 'fin-005-3',
        tipo: 'receita',
        descricao: 'Honorários de êxito (20% da condenação prevista)',
        valor: 18000,
        status: 'pendente',
        vencimento: '2026-12-01',
        casoId: 'caso-005',
        clienteId: 'cli-1',
        categoria: 'honorario',
      },
    ],
  },
  {
    id: 'caso-006',
    clienteId: 'cli-4',
    clienteNome: 'TechVision Sistemas Ltda',
    clienteTelefone: '(11) 3456-7890',
    clienteEmail: 'juridico@techvision.com.br',
    areaJuridica: 'tributario',
    advogadoId: 'adv-1',
    advogadoNome: 'Dra. Ana Souza',
    workflowId: 'wf-processos',
    colunaId: 'proc-3',
    position: 0,
    etiquetas: ['recurso'],
    proximoPrazo: '2026-07-20',
    proximaTarefa: 'Acompanhar distribuição',
    ultimaAtualizacao: '2026-06-25T10:00:00',
    criadoEm: '2026-05-10T09:00:00',
    numeroCNJ: '5089234-12.2026.4.03.6100',
    tribunal: 'TRF-3',
    vara: '5ª Vara Federal Tributária de São Paulo',
    observacoes: 'Mandado de segurança contra recolhimento de PIS/COFINS sobre receitas financeiras. Tese favorável ao contribuinte (Tema 372 do STF).',
    partes: {
      requerente: 'TechVision Sistemas Ltda',
      requerido: 'União Federal (Receita Federal)',
    },
    timeline: [
      {
        id: 'tl-006-1',
        tipo: 'caso_criado',
        titulo: 'Processo cadastrado',
        descricao: 'MS impetrado contra recolhimento indevido de PIS/COFINS.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-05-10T09:00:00',
      },
      {
        id: 'tl-006-2',
        tipo: 'peticao_enviada',
        titulo: 'Petição inicial protocolada',
        descricao: 'MS com pedido de liminar distribuído na 5ª VF Tributária.',
        autor: 'Dra. Ana Souza',
        autorIniciais: 'AS',
        autorCor: 'bg-violet-500',
        data: '2026-05-12T11:00:00',
      },
    ],
    tarefas: [],
    eventos: [],
    documentos: [],
    financeiro: [],
  },
  {
    id: 'caso-007',
    clienteId: 'cli-2',
    clienteNome: 'João Carlos Pereira',
    clienteTelefone: '(11) 98567-3421',
    clienteEmail: 'joao.pereira@hotmail.com',
    areaJuridica: 'consumidor',
    advogadoId: 'adv-2',
    advogadoNome: 'Dr. Ricardo Lima',
    workflowId: 'wf-processos',
    colunaId: 'proc-6',
    position: 0,
    etiquetas: ['recurso'],
    proximoPrazo: '2026-07-25',
    proximaTarefa: 'Analisar sentença e prazo recursal',
    ultimaAtualizacao: '2026-06-24T14:00:00',
    criadoEm: '2024-08-15T09:00:00',
    numeroCNJ: '1087654-32.2024.8.26.0100',
    tribunal: 'TJSP',
    vara: '2ª Vara Cível — JEC',
    observacoes: 'Ação de danos morais por cobranças indevidas de operadora de cartão de crédito. Sentença favorável com R$ 8.000 de danos morais. Prazo para recurso da ré.',
    partes: {
      requerente: 'João Carlos Pereira',
      requerido: 'BancoCard S.A.',
      advogadoContrario: 'Dra. Cláudia Ferreira (OAB/SP 567.890)',
    },
    timeline: [
      {
        id: 'tl-007-1',
        tipo: 'caso_criado',
        titulo: 'Processo cadastrado',
        descricao: 'JEC — cobranças indevidas por cartão de crédito.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2024-08-15T09:00:00',
      },
      {
        id: 'tl-007-2',
        tipo: 'movimentacao_processo',
        titulo: 'Sentença publicada',
        descricao: 'Sentença favorável: danos morais de R$ 8.000 + devolução em dobro dos valores cobrados indevidamente.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-06-24T14:00:00',
      },
    ],
    tarefas: [],
    eventos: [],
    documentos: [],
    financeiro: [],
  },
  {
    id: 'caso-008',
    clienteId: 'cli-5',
    clienteNome: 'Carlos Eduardo Mendes',
    clienteTelefone: '(11) 96789-1234',
    clienteEmail: 'carlosmendes@gmail.com',
    areaJuridica: 'previdenciario',
    advogadoId: 'adv-2',
    advogadoNome: 'Dr. Ricardo Lima',
    workflowId: 'wf-processos',
    colunaId: 'proc-2',
    position: 0,
    etiquetas: ['aguardando-cliente'],
    proximoPrazo: '2026-08-01',
    proximaTarefa: 'Protocolar petição inicial',
    ultimaAtualizacao: '2026-06-20T11:00:00',
    criadoEm: '2026-02-14T09:00:00',
    numeroCNJ: null,
    tribunal: 'JEF — Juizado Especial Federal',
    vara: 'Em distribuição',
    observacoes: 'Aposentadoria por invalidez negada pelo INSS. Laudo pericial favorável. Aguardando documentação médica complementar do cliente.',
    partes: {
      requerente: 'Carlos Eduardo Mendes',
      requerido: 'Instituto Nacional do Seguro Social — INSS',
    },
    timeline: [
      {
        id: 'tl-008-1',
        tipo: 'caso_criado',
        titulo: 'Processo cadastrado',
        descricao: 'Benefício de aposentadoria por invalidez negado. Recurso administrativo indeferido.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-02-14T09:00:00',
      },
      {
        id: 'tl-008-2',
        tipo: 'tarefa_criada',
        titulo: 'Aguardando documentação médica',
        descricao: 'Cliente deve trazer laudos dos últimos 2 anos e CID atualizado.',
        autor: 'Dr. Ricardo Lima',
        autorIniciais: 'RL',
        autorCor: 'bg-cyan-500',
        data: '2026-02-14T09:30:00',
      },
    ],
    tarefas: [],
    eventos: [],
    documentos: [],
    financeiro: [],
  },
]

// ----- HELPERS -----------------------------------------------

export function getClienteById(id: string): Cliente | undefined {
  return CLIENTES.find((c) => c.id === id)
}

// ----- DASHBOARD STATS ----------------------------------------

export const DASHBOARD_STATS = {
  casosAtivos: 8,
  casosNegociacao: 4,
  processosPendentes: 4,
  clientesAtivos: 5,
  tarefasPendentes: 5,
  audienciasProximas: 2,
  prazosProximos: 3,
  receitaMesAtual: 38500,
  receitaMesAnterior: 29200,
  despesasMes: 1342,
}

export const PROXIMOS_PRAZOS = [
  {
    id: 'pz-1',
    titulo: 'Rol de Testemunhas — TRT-2',
    casoId: 'caso-005',
    clienteNome: 'Maria Aparecida Silva',
    data: '2026-07-08',
    isFatal: true,
    areaJuridica: 'trabalhista' as AreaJuridica,
    advogado: 'Dra. Ana Souza',
  },
  {
    id: 'pz-2',
    titulo: 'Audiência de Conciliação — TJSP',
    casoId: 'caso-004',
    clienteNome: 'Ana Paula Costa',
    data: '2026-07-03',
    isFatal: false,
    areaJuridica: 'familia' as AreaJuridica,
    advogado: 'Dr. Ricardo Lima',
  },
  {
    id: 'pz-3',
    titulo: 'Reunião — Proposta TechVision',
    casoId: 'caso-003',
    clienteNome: 'TechVision Sistemas Ltda',
    data: '2026-07-05',
    isFatal: false,
    areaJuridica: 'tributario' as AreaJuridica,
    advogado: 'Dra. Ana Souza',
  },
  {
    id: 'pz-4',
    titulo: 'Prazo Recursal — Sentença BancoCard',
    casoId: 'caso-007',
    clienteNome: 'João Carlos Pereira',
    data: '2026-07-25',
    isFatal: true,
    areaJuridica: 'consumidor' as AreaJuridica,
    advogado: 'Dr. Ricardo Lima',
  },
]

export const AGENDA_DO_DIA = [
  {
    id: 'ag-1',
    hora: '09:00',
    titulo: 'Audiência de Conciliação — Costa x Costa',
    tipo: 'audiencia' as const,
    cliente: 'Ana Paula Costa',
    local: 'TJSP — Sala 302',
    duracao: '1h30min',
    data: '2026-07-03',
  },
  {
    id: 'ag-2',
    hora: '10:00',
    titulo: 'Reunião — TechVision Proposta Tributária',
    tipo: 'reuniao' as const,
    cliente: 'TechVision Sistemas Ltda',
    local: 'Escritório',
    duracao: '1h30min',
    data: '2026-07-05',
  },
  {
    id: 'ag-3',
    hora: '14:00',
    titulo: 'Audiência de Instrução — Silva x Constrói Bem',
    tipo: 'audiencia' as const,
    cliente: 'Maria Aparecida Silva',
    local: 'TRT-2 — Sala 5A',
    duracao: '2h',
    data: '2026-07-15',
  },
]

export const ULTIMAS_ATIVIDADES = [
  {
    id: 'at-1',
    tipo: 'audiencia_criada' as const,
    descricao: 'Audiência de instrução marcada para 15/07',
    caso: 'Silva x Constrói Bem',
    autor: 'Dra. Ana Souza',
    autorIniciais: 'AS',
    autorCor: 'bg-violet-500',
    data: '2026-06-29T15:00:00',
  },
  {
    id: 'at-2',
    tipo: 'mudanca_coluna' as const,
    descricao: 'Caso movido para "Em Negociação"',
    caso: 'Costa x Costa — Divórcio',
    autor: 'Dr. Ricardo Lima',
    autorIniciais: 'RL',
    autorCor: 'bg-cyan-500',
    data: '2026-06-29T11:00:00',
  },
  {
    id: 'at-3',
    tipo: 'acordo_proposto' as const,
    descricao: 'Proposta de acordo tributário enviada à Procuradoria',
    caso: 'TechVision — PIS/COFINS',
    autor: 'Dra. Ana Souza',
    autorIniciais: 'AS',
    autorCor: 'bg-violet-500',
    data: '2026-06-26T09:00:00',
  },
  {
    id: 'at-4',
    tipo: 'movimentacao_processo' as const,
    descricao: 'Sentença favorável publicada — R$ 8.000 danos morais',
    caso: 'Pereira x BancoCard',
    autor: 'Dr. Ricardo Lima',
    autorIniciais: 'RL',
    autorCor: 'bg-cyan-500',
    data: '2026-06-24T14:00:00',
  },
  {
    id: 'at-5',
    tipo: 'documento_anexado' as const,
    descricao: 'Boletim de ocorrência e fotos do acidente anexados',
    caso: 'Pereira x BrasilSeg',
    autor: 'Dr. Ricardo Lima',
    autorIniciais: 'RL',
    autorCor: 'bg-cyan-500',
    data: '2026-06-22T11:30:00',
  },
]
