import type { BpWebhookPayload } from './types'

/**
 * Corpos de teste com a forma REAL dos webhooks da BuscaProcessos.
 *
 * "Real" aqui não é força de expressão: os campos e o ENVELOPE saem das
 * entregas registradas em `webhook_events`. Duas versões anteriores erraram
 * exatamente nisso: a primeira foi montada a partir do OpenAPI dos endpoints
 * `GET /v1/...`, a segunda embrulhou o corpo num envelope `data` que a origem
 * nunca manda. Nos dois casos o disparo de teste passava e a entrega de verdade
 * caía em `ignored` — HTTP 200, nada gravado, nenhum erro em lugar nenhum.
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

/**
 * O envelope real é PLANO: `event` no topo e o conteúdo ao lado dele.
 *
 * Nenhuma das entregas registradas em `webhook_events` tem `data`, `source`,
 * `created_at` ou `id` — o que identifica o evento é `uuid`. O corpo montado
 * aqui é o que a tela dispara, então ele tem que ter a forma que chega de fato:
 * um envelope a mais aqui é um caminho que nunca é exercitado lá.
 */
function envelope(event: string, body: Record<string, unknown>): BpWebhookPayload {
  return {
    uuid: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    event,
    ...body,
  } as unknown as BpWebhookPayload
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
          // O CNJ mora aqui e em `numero_processo` — `processo_id` não traz id
          // nenhum nas entregas reais.
          processo_id: scenario === 'diario_movimentacao_nova' ? cnj : CNJ_INEXISTENTE,
          numero_processo: scenario === 'diario_movimentacao_nova' ? cnj : CNJ_INEXISTENTE,
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
          // Sem `processo: { numero_novo }` de propósito: o contrato descreve
          // esse objeto, as entregas reais não o mandam, e é o formato real que
          // o disparo de teste precisa exercitar.
        },
      })
    }

    case 'evento_ignorado':
      return envelope('processo_nao_encontrado', { numeroCnj: cnj })
  }
}
