import { addDays, differenceInCalendarDays } from 'date-fns'
import { getEventById, updateEvent } from '@/features/agenda/services/events.service'
import { toEventMovePatch } from '@/features/agenda/utils/dragMove'
import { createHearing, getHearingKinds } from '@/features/audiencias/services/hearings.service'
import { HearingCreatedWithoutDateError } from '@/features/audiencias/services/hearings.service'
import {
  SignatureRouteError,
  sendForSignature,
} from '@/features/assinaturas/services/signatures.service'
import { createFinancialEntry } from '@/features/financeiro/services/financialEntries.service'
import {
  PaymentLinkError,
  createPaymentLink,
} from '@/features/financeiro/services/paymentCharges.service'
import {
  linkPublicationToProcess,
  setPublicationHandled,
} from '@/features/publicacoes/services/publications.service'
import { updateTask } from '@/features/tarefas/services/tasks.service'
import { financialEntrySchema } from '@/schemas/financialEntry.schema'
import type { ActionInput, ActionOutput } from '../tools/actions'
import { planSignature } from './signaturePlan'

/**
 * As ações das telas (fase 4c), depois da confirmação. Cada uma chama o
 * service da tela, como as demais de `useExecuteAction` — quem invalida o
 * cache é o hook, que tem os helpers de cada módulo.
 *
 * Recusa prevista (regra do módulo, dado que falta) volta como `ok: false`
 * com o motivo, para o modelo explicar. Erro inesperado sobe, e o chat avisa.
 */

export async function completeTask(
  input: ActionInput<'concluir_tarefa'>,
  userId: string,
): Promise<ActionOutput> {
  // Sem `current`: "somente esta" — numa série, conclui só a ocorrência.
  await updateTask({ id: input.tarefa_id, status: 'done' }, userId)
  return { ok: true, id: input.tarefa_id, link: '/tarefas' }
}

export async function reassignTask(
  input: ActionInput<'reatribuir_tarefa'>,
  userId: string,
): Promise<ActionOutput> {
  await updateTask({ id: input.tarefa_id, assigned_to: input.responsavel_id }, userId)
  return { ok: true, id: input.tarefa_id, link: '/tarefas' }
}

/** Data e hora do escritório como `Date` local (a tela roda no fuso dele). */
function localDate(day: string, time?: string): Date {
  return new Date(`${day}T${time ?? '00:00'}:00`)
}

/**
 * Como o arraste da Agenda: `toEventMovePatch` + `updateEvent` só nesta
 * ocorrência. Sem término informado, a duração (em horas ou em dias) fica.
 * Audiência acompanha pelo gatilho `sync_event_hearing` (migration 76).
 */
export async function rescheduleEvent(
  input: ActionInput<'remarcar_evento'>,
  userId: string,
): Promise<ActionOutput> {
  const event = await getEventById(input.evento_id)
  if (!event) return { ok: false, motivo: 'compromisso não encontrado ou sem acesso' }
  if (event.contract_id) {
    return { ok: false, motivo: 'vencimento de contrato muda pelo contrato, não pela Agenda' }
  }

  const allDay = !input.hora
  const start = localDate(input.data, input.hora)
  let end: Date
  if (input.data_fim || input.hora_fim) {
    end = localDate(input.data_fim ?? input.data, allDay ? undefined : input.hora_fim)
  } else if (allDay) {
    const days = differenceInCalendarDays(new Date(event.end_at), new Date(event.start_at))
    end = addDays(start, Math.max(days, 0))
  } else {
    const duration = new Date(event.end_at).getTime() - new Date(event.start_at).getTime()
    end = new Date(start.getTime() + Math.max(duration, 0))
  }
  if (end < start) return { ok: false, motivo: 'o término ficou antes do início' }

  const patch = toEventMovePatch(event, { start, end, allDay })
  await updateEvent(patch, userId, { current: event, scope: 'this' })
  return { ok: true, id: event.id, link: '/agenda' }
}

export async function createHearingAction(
  input: ActionInput<'criar_audiencia'>,
  userId: string,
): Promise<ActionOutput> {
  const kinds = await getHearingKinds()
  const kind = kinds.find((candidate) => candidate.id === input.tipo_id)
  if (!kind) return { ok: false, motivo: 'tipo de audiência desconhecido (veja tipos_de_audiencia)' }
  if (input.data && !input.hora) {
    return { ok: false, motivo: 'informe também o horário, ou crie sem data' }
  }

  const start = input.data ? localDate(input.data, input.hora) : null
  const schedule = start
    ? {
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + kind.default_duration_minutes * 60_000).toISOString(),
      }
    : null

  try {
    const id = await createHearing({
      legalProcessId: input.processo_id,
      kindId: kind.id,
      modality: input.modalidade ?? null,
      userId,
      schedule,
    })
    return { ok: true, id, link: `/processos/${input.processo_id}` }
  } catch (error) {
    if (error instanceof HearingCreatedWithoutDateError) {
      return {
        ok: false,
        motivo: 'a audiência foi criada, mas a data não foi salva — informe a data na ficha',
      }
    }
    throw error
  }
}

export async function registerFinancialEntry(
  input: ActionInput<'registrar_lancamento'>,
  userId: string,
): Promise<ActionOutput> {
  // O mesmo zod do formulário: vencimento ou condição, conforme o tipo.
  const parsed = financialEntrySchema.safeParse({
    type: input.tipo,
    category: input.categoria,
    description: input.descricao,
    amount: input.valor,
    status: input.situacao,
    settlement_kind: input.vencimento ? 'scheduled' : 'conditional',
    due_date: input.vencimento ?? null,
    condition_description: input.vencimento ? null : (input.condicao ?? null),
    paid_at: input.situacao === 'pago' ? (input.pago_em ?? input.vencimento ?? null) : null,
    client_id: input.cliente_id ?? null,
    legal_process_id: input.processo_id ?? null,
  })
  if (!parsed.success) {
    return { ok: false, motivo: parsed.error.issues[0]?.message ?? 'dados do lançamento incompletos' }
  }
  const entry = await createFinancialEntry(parsed.data, userId)
  return { ok: true, id: entry.id, link: '/financeiro' }
}

export async function linkPublication(
  input: ActionInput<'vincular_publicacao'>,
): Promise<ActionOutput> {
  await linkPublicationToProcess(input.publicacao_id, input.processo_id)
  return { ok: true, id: input.publicacao_id, link: `/publicacoes/${input.publicacao_id}` }
}

export async function handlePublication(
  input: ActionInput<'tratar_publicacao'>,
): Promise<ActionOutput> {
  await setPublicationHandled(input.publicacao_id, true)
  return { ok: true, id: input.publicacao_id, link: `/publicacoes/${input.publicacao_id}` }
}

/** Monta de novo na confirmação: envia o que está no cadastro agora. */
export async function sendToSignature(
  input: ActionInput<'enviar_para_assinatura'>,
): Promise<ActionOutput> {
  const plan = await planSignature({
    documentId: input.documento_id,
    contractId: input.contrato_id ?? null,
    message: input.mensagem ?? null,
    deadline: input.prazo ?? null,
  })
  if (!plan.request.ok) return { ok: false, motivo: plan.request.reason }

  const link = input.contrato_id ? `/contratos/${input.contrato_id}` : '/documentos'
  try {
    const { request } = await sendForSignature(plan.request.input)
    return { ok: true, id: request.id, link }
  } catch (error) {
    if (error instanceof SignatureRouteError) {
      // Criado e parado num passo: aparece na tela, com "Tentar de novo".
      return {
        ok: false,
        motivo: error.request
          ? `o envio foi criado mas parou (${error.message}) — use "Tentar de novo" na tela`
          : error.message,
      }
    }
    throw error
  }
}

export async function createPaymentLinkAction(
  input: ActionInput<'gerar_link_pagamento'>,
): Promise<ActionOutput> {
  try {
    const charge = await createPaymentLink(input.lancamento_id)
    return { ok: true, id: charge.id, link: charge.checkout_url ?? undefined }
  } catch (error) {
    // A rota explica: não é receita pendente, conta não configurada, já há link.
    if (error instanceof PaymentLinkError) return { ok: false, motivo: error.message }
    throw error
  }
}
