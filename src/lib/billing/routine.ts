// Server-side. Roda no cron diário (`/api/cron/diario`), pela service_role.
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicAppBaseUrl } from '@/lib/appUrl'
import type { BillingPanelItem } from '@/types/billing.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { loadBillingPanel } from './panel'

/** Quanto tempo depois do clique em "Pagar" sem pagamento o sino avisa
 * (decidido em 2026-11-23, depois da fase 0). */
const CLICK_ALERT_AFTER_MS = 24 * 3_600_000

/** Quantos nomes o aviso da fila cita antes de "e mais N". */
const QUEUE_NAMES = 5

export interface BillingRoutineSummary {
  queue: number
  clickAlerts: number
  endedAlerts: number
}

function moment(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function who(item: BillingPanelItem): string {
  return item.client?.displayName ?? 'Cliente sem cadastro'
}

async function notify(
  supabase: SupabaseClient,
  input: { kind: string; title: string; body: string; link: string; entryId: string | null },
) {
  const { error } = await supabase.from('notifications').insert({
    kind: input.kind,
    // Só quem vê o Financeiro recebe: o aviso cita cliente e valor.
    resource: 'financeiro',
    title: input.title,
    body: input.body,
    link: input.link,
    entity_type: input.entryId ? 'financial_entry' : null,
    entity_id: input.entryId,
    source: 'cron',
  })
  if (error) throw error
}

/** Já saiu hoje (em Brasília) o aviso da fila? O cron pode rodar de novo. */
async function queueNoticeSentToday(supabase: SupabaseClient, today: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'cobranca_fila')
    .gte('created_at', new Date(`${today}T00:00:00-03:00`).toISOString())
  if (error) throw error
  return (count ?? 0) > 0
}

/**
 * A rotina diária da régua (fase 2 de docs/cobrancas.md). Não manda nada ao
 * cliente — a fila é manual nesta fase —, só avisa o escritório no sino:
 *
 *   1. quantas cobranças têm aviso hoje (uma vez por dia);
 *   2. o cliente que clicou em "Pagar" há mais de 24 h e o pagamento não
 *      chegou — pode ter pago e fechado a aba antes do aviso da InfinitePay;
 *   3. a cobrança que passou da última etapa sem ser paga.
 *
 * Os avisos 2 e 3 saem uma vez por clique e por vencimento
 * (`click_alert_for`, `ended_alert_for`, migration 96).
 */
export async function runBillingRoutine(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<BillingRoutineSummary> {
  const panel = await loadBillingPanel(supabase, {
    requestOrigin: publicAppBaseUrl() ?? 'http://localhost:3000',
    now,
  })
  const summary: BillingRoutineSummary = { queue: 0, clickAlerts: 0, endedAlerts: 0 }

  const queue = panel.items.filter((item) => item.dueStep !== null)
  summary.queue = queue.length
  if (queue.length > 0 && !(await queueNoticeSentToday(supabase, panel.today))) {
    const names = queue.slice(0, QUEUE_NAMES).map(who)
    const more = queue.length > QUEUE_NAMES ? ` e mais ${queue.length - QUEUE_NAMES}` : ''
    await notify(supabase, {
      kind: 'cobranca_fila',
      title:
        queue.length === 1
          ? '1 cobrança para avisar hoje'
          : `${queue.length} cobranças para avisar hoje`,
      body: `${names.join(', ')}${more}. A mensagem está pronta na aba Cobranças.`,
      link: '/financeiro?aba=cobrancas',
      entryId: null,
    })
  }

  for (const item of panel.items) {
    const { billing } = item
    const open = item.entry.status === 'pendente' && billing.canceled_at === null

    const clicked = billing.checkout_clicked_at
    if (
      open &&
      clicked &&
      now.getTime() - new Date(clicked).getTime() >= CLICK_ALERT_AFTER_MS &&
      (!billing.click_alert_for ||
        new Date(billing.click_alert_for).getTime() !== new Date(clicked).getTime())
    ) {
      await notify(supabase, {
        kind: 'cobranca_clique_sem_pagamento',
        title: 'Foi ao pagamento e nada chegou',
        body:
          `${who(item)} clicou em Pagar em ${moment(clicked)} ("${item.entry.description}", ` +
          `${formatCurrency(item.entry.amount)}), e o pagamento não foi confirmado em 24 horas. ` +
          'Confira no app da InfinitePay; se estiver lá, use "Já pago na InfinitePay".',
        link: `/financeiro?id=${item.entry.id}`,
        entryId: item.entry.id,
      })
      const { error } = await supabase
        .from('billings')
        .update({ click_alert_for: clicked })
        .eq('id', billing.id)
      if (error) throw error
      summary.clickAlerts++
    }

    if (item.state === 'ended' && item.entry.due_date && billing.ended_alert_for !== item.entry.due_date) {
      await notify(supabase, {
        kind: 'cobranca_regua_encerrada',
        title: 'Régua encerrada sem pagamento',
        body:
          `"${item.entry.description}" (${who(item)}, ${formatCurrency(item.entry.amount)}) ` +
          'passou do último lembrete e continua em aberto. Os avisos pararam: decida o próximo ' +
          'passo com o cliente.',
        link: `/financeiro?id=${item.entry.id}`,
        entryId: item.entry.id,
      })
      const { error } = await supabase
        .from('billings')
        .update({ ended_alert_for: item.entry.due_date })
        .eq('id', billing.id)
      if (error) throw error
      summary.endedAlerts++
    }
  }

  return summary
}
