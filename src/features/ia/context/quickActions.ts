import { SECTION_LABELS, type ScreenContext, type ScreenEntityKind } from './screenContext'

/**
 * Ações rápidas do painel (fase 4b): botões com pedido fixo, a mesma ideia das
 * perguntas prontas do portal. O pedido aparece na conversa como se a pessoa
 * tivesse digitado — é o que o modelo recebe, junto com a tela.
 *
 * `send`: envia na hora. `prefill`: põe o começo no campo para a pessoa
 * completar ("O que mudou desde…" precisa de uma data).
 */
export interface QuickAction {
  id: string
  label: string
  prompt: string
  mode: 'send' | 'prefill'
}

const SUMMARIZE_PROCESS: QuickAction = {
  id: 'processo-resumir',
  label: 'Resumir',
  prompt:
    'Resuma este processo: em que fase está, o que aconteceu por último e o que está pendente.',
  mode: 'send',
}

const PROCESS_CHANGES: QuickAction = {
  id: 'processo-mudancas',
  label: 'O que mudou desde…',
  prompt: 'O que mudou neste processo desde ',
  mode: 'prefill',
}

const PREPARE_PROCESS_HEARING: QuickAction = {
  id: 'processo-audiencia',
  label: 'Preparar audiência',
  prompt:
    'Prepare a próxima audiência deste processo: data, tipo, modalidade e local ou link, os ' +
    'pontos que as movimentações mostram e o checklist com o que falta e o que o cliente traz.',
  mode: 'send',
}

/** O mesmo pedido a partir da ficha da audiência (o botão do modal). */
export const PREPARE_HEARING_PROMPT =
  'Prepare esta audiência: data, tipo, modalidade e local ou link, os pontos que as ' +
  'movimentações do processo mostram e o checklist com o que falta e o que o cliente traz.'

const EXPLAIN_PUBLICATION: QuickAction = {
  id: 'publicacao-explicar',
  label: 'Explicar e sugerir providência',
  prompt:
    'Explique esta publicação: que ato é, o que pede e de quem, se gera prazo para o nosso ' +
    'cliente e qual providência cabe. Se gerar prazo, calcule o vencimento e proponha a tarefa.',
  mode: 'send',
}

const CLIENT_OVERVIEW: QuickAction = {
  id: 'cliente-panorama',
  label: 'Panorama',
  prompt:
    'Panorama deste cliente: processos e em que pé estão, tarefas abertas, financeiro em aberto ' +
    'e próximos compromissos.',
  mode: 'send',
}

const CLIENT_UPDATE_DRAFT: QuickAction = {
  id: 'cliente-atualizacao',
  label: 'Rascunhar atualização',
  prompt:
    'Rascunhe uma mensagem de WhatsApp para este cliente com a atualização dos processos dele, ' +
    'em linguagem simples, para eu revisar antes de enviar.',
  mode: 'send',
}

const DAILY_BRIEFING: QuickAction = {
  id: 'dashboard-briefing',
  label: 'Briefing do dia',
  prompt:
    'Briefing de hoje para mim: meus compromissos, minhas tarefas que vencem hoje ou estão ' +
    'atrasadas e as publicações ainda não lidas.',
  mode: 'send',
}

const BY_ENTITY: Partial<Record<ScreenEntityKind, readonly QuickAction[]>> = {
  processo: [SUMMARIZE_PROCESS, PROCESS_CHANGES, PREPARE_PROCESS_HEARING],
  publicacao: [EXPLAIN_PUBLICATION],
  cliente: [CLIENT_OVERVIEW, CLIENT_UPDATE_DRAFT],
}

/** As ações da tela: pelo registro em foco, ou pela página quando não há. */
export function quickActionsFor(context: ScreenContext): readonly QuickAction[] {
  const focus = context.entities[0]
  if (focus) return BY_ENTITY[focus.kind] ?? []
  if (context.page === SECTION_LABELS.dashboard) return [DAILY_BRIEFING]
  return []
}
