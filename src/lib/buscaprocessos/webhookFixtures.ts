import type { BpWebhookPayload } from './types'

/**
 * Corpos de teste com a forma REAL dos webhooks da BuscaProcessos.
 *
 * "Real" aqui não é força de expressão: são payloads recebidos em produção,
 * copiados campo a campo. A versão anterior deste arquivo foi montada a partir
 * do OpenAPI dos endpoints `GET /v1/...`, e por isso testava o handler contra
 * uma forma que a origem nunca envia — os testes passavam e o webhook de
 * verdade era ignorado em silêncio.
 *
 * O conteúdo é fixo de propósito: disparar o mesmo cenário duas vezes tem que
 * cair na deduplicação, e é isso que prova que ela funciona.
 */

export const WEBHOOK_SCENARIOS = [
  {
    value: 'movimentacao_nova',
    label: 'Movimentação de processo cadastrado',
    description:
      'Ato num processo monitorado. CNJ em processo.numero_unico, data em dd/MM/yyyy. Vai para a timeline em legal_process_movements, com o mesmo hash da sincronização.',
    requiresCnj: true,
  },
  {
    value: 'movimentacao_sem_processo',
    label: 'Movimentação de CNJ não cadastrado',
    description:
      'Deve parar em unmatched: a timeline exige processo, e criar um processo vazio para acomodar o evento seria pior.',
    requiresCnj: false,
  },
  {
    value: 'diario_movimentacao_nova',
    label: 'Publicação de diário (monitoramento por OAB)',
    description:
      'Intimação encontrada no diário. Conteúdo em HTML, tipo em `tipo`, envolvidos viram destinatários e advogados. Vai para Publicações — é o caminho que deduplica contra o cadastro do processo.',
    requiresCnj: true,
  },
  {
    value: 'diario_orfa',
    label: 'Publicação de diário sem processo cadastrado',
    description:
      'Entra como publicação órfã. É justamente a intimação que não pode passar batido.',
    requiresCnj: false,
  },
  {
    value: 'evento_ignorado',
    label: 'Evento sem tratamento',
    description: 'Deve responder ignored, sem gravar nada e sem erro.',
    requiresCnj: false,
  },
] as const

export type WebhookScenario = (typeof WEBHOOK_SCENARIOS)[number]['value']

export const WEBHOOK_SCENARIO_VALUES = WEBHOOK_SCENARIOS.map((scenario) => scenario.value)

/** CNJ de teste que não corresponde a processo nenhum. */
const CNJ_INEXISTENTE = '0000000-00.0000.0.00.0000'

export interface FixtureInput {
  /** Obrigatório nos cenários com `requiresCnj`. */
  cnj?: string | null
  /** Sobrescreve o texto — é o que permite disparar "o mesmo de novo". */
  conteudo?: string | null
  /** 'yyyy-MM-dd'. É convertida para o formato de cada evento. */
  date?: string | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy', que é como o webhook de movimentação data. */
function toBrDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function envelope(event: string, data: Record<string, unknown>): BpWebhookPayload {
  return {
    id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    event,
    source: 'BUSCAPROCESSOS',
    created_at: new Date().toISOString(),
    data: { event, ...data },
    // A origem repete `data` em `raw`. Não é lido, mas está aqui para o corpo
    // exibido na tela ser fiel ao que chega.
    raw: { event, ...data },
  }
}

export function buildWebhookPayload(
  scenario: WebhookScenario,
  input: FixtureInput = {},
): BpWebhookPayload {
  const cnj = input.cnj?.trim() || CNJ_INEXISTENTE
  const iso = input.date || today()

  switch (scenario) {
    case 'movimentacao_nova':
    case 'movimentacao_sem_processo':
      return envelope('movimentacao_nova', {
        processo: {
          origem: 'TJES',
          instancia: 'PRIMEIRO_GRAU',
          numero_unico: scenario === 'movimentacao_nova' ? cnj : CNJ_INEXISTENTE,
        },
        event_data: {
          id: 123456,
          data: toBrDate(iso),
          conteudo:
            input.conteudo ||
            'Conclusos para despacho. Teste de integração disparado pela tela de Configurações.',
        },
      })

    case 'diario_movimentacao_nova':
    case 'diario_orfa': {
      const texto =
        input.conteudo ||
        'Fica o patrono da parte autora intimado da decisão proferida nos autos, no prazo de 15 (quinze) dias. Teste de integração.'

      return envelope('diario_movimentacao_nova', {
        monitoramento: [
          {
            termo: 'ESCRITÓRIO EXEMPLO',
            tipo: 'TERMO',
            descricao: 'ESCRITÓRIO EXEMPLO',
            data_ultima_aparicao: toBrDate(iso),
          },
        ],
        movimentacao: {
          id: 987654321,
          secao: 'Publicações e Intimações',
          texto_categoria: 'Despacho',
          diario_oficial_id: 111,
          processo_id: 222,
          pagina: 10,
          tipo: 'Intimação',
          conteudo: `<p>${texto}</p>`,
          data: `${iso} 00:00:00`,
          diario_oficial: `${toBrDate(iso)} | Diário Oficial Exemplo`,
          estado: 'Espírito Santo',
          envolvidos: [
            { nome: 'ADVOGADO EXEMPLO', envolvido_tipo: 'Advogado', oab: '123456/ES' },
            { nome: 'PARTE EXEMPLO', envolvido_tipo: 'Requerente', oab: null },
          ],
          link: 'https://www.exemplo.com/processo',
          link_pdf: 'https://www.exemplo.com/diario.pdf',
          processo: {
            numero_novo: scenario === 'diario_movimentacao_nova' ? cnj : CNJ_INEXISTENTE,
          },
        },
      })
    }

    case 'evento_ignorado':
      return envelope('processo_nao_encontrado', { numeroCnj: cnj })
  }
}
