import { tool } from 'ai'
import { z } from 'zod'
import { publicAppBaseUrl } from '@/lib/appUrl'
import { loadBillingPanel } from '@/lib/billing/panel'
import { isPastDue, matchesBillingFilter } from '@/lib/billing/panelFilters'
import { BILLING_STATE_LABELS, describeStep } from '@/lib/billing/schedule'
import { listSeries } from '@/lib/billing/series'
import { BILLING_MESSAGE_STATUS_LABELS, type BillingPanelItem } from '@/types/billing.types'
import { BILLING_SERIES_STATE_LABELS } from '@/types/billingSeries.types'
import { limitSchema, MAX_RESULTS, type ToolClient } from '../shared'

/**
 * As cobranças e as mensalidades (fase 7 de docs/cobrancas.md). Leitura com o
 * client do usuário: sem acesso ao Financeiro, a RLS devolve lista vazia. A
 * conta é a mesma da aba Cobranças (`loadBillingPanel`), inclusive o valor do
 * dia com multa, juros ou desconto.
 */

const SITUATIONS = [
  'para_avisar_hoje',
  'vencidas',
  'na_regua',
  'pausadas_ou_encerradas',
  'so_o_link',
  'pagas',
  'todas',
] as const

type Situation = (typeof SITUATIONS)[number]

function matches(item: BillingPanelItem, situation: Situation, today: string): boolean {
  switch (situation) {
    case 'para_avisar_hoje':
      return item.dueStep !== null
    case 'vencidas':
      return isPastDue(item, today)
    case 'na_regua':
      return matchesBillingFilter(item, 'running')
    case 'pausadas_ou_encerradas':
      return matchesBillingFilter(item, 'stopped')
    case 'so_o_link':
      return matchesBillingFilter(item, 'link_only')
    case 'pagas':
      return matchesBillingFilter(item, 'paid')
    case 'todas':
      return true
  }
}

function cents(value: number): number {
  return Math.round(value) / 100
}

function failure(context: string, error: unknown) {
  console.error(`[ia] tool ${context} falhou:`, error)
  return { error: `Não foi possível consultar ${context}.` }
}

export function createBillingTools(supabase: ToolClient) {
  return {
    ver_cobrancas: tool({
      description:
        'Cobranças dos lançamentos a receber (a página de pagamento e a régua de lembretes): ' +
        'quem tem aviso hoje, quem está vencido, o valor de hoje com multa e juros, o último ' +
        'aviso e se o cliente abriu a página. "vencidas" é toda cobrança em aberto com o ' +
        'vencimento passado, com régua ou só com o link. Quem não tem acesso ao Financeiro ' +
        'recebe lista vazia. Nenhum aviso sai daqui: a fila é manual, na aba Cobranças.',
      inputSchema: z.object({
        situacao: z.enum(SITUATIONS).optional().describe('Padrão: vencidas.'),
        cliente_id: z.string().uuid().optional(),
        limite: limitSchema,
      }),
      execute: async (input) => {
        let panel
        try {
          panel = await loadBillingPanel(supabase, {
            requestOrigin: publicAppBaseUrl() ?? 'http://localhost:3000',
          })
        } catch (error) {
          return failure('as cobranças', error)
        }
        const situation = input.situacao ?? 'vencidas'
        const matching = panel.items.filter(
          (item) =>
            matches(item, situation, panel.today) &&
            (!input.cliente_id || item.client?.id === input.cliente_id),
        )
        const listed = matching.slice(0, input.limite ?? 10)
        const totalToday = matching
          .filter((item) => item.entry.status === 'pendente')
          .reduce((sum, item) => sum + item.amountToday.totalCents, 0)

        return {
          hoje: panel.today,
          encontradas: matching.length,
          valor_de_hoje_das_em_aberto: cents(totalToday),
          cobrancas: listed.map((item) => {
            const last = item.messages[0] ?? null
            return {
              lancamento_id: item.entry.id,
              cliente: item.client?.displayName ?? null,
              cliente_id: item.client?.id ?? null,
              descricao_para_o_cliente: item.billing.client_description,
              descricao_interna: item.entry.description,
              valor_original: item.entry.amount,
              valor_de_hoje: cents(item.amountToday.totalCents),
              multa: cents(item.amountToday.lateFeeCents),
              juros: cents(item.amountToday.interestCents),
              no_pix_ate_o_vencimento: item.amountToday.pixDiscount
                ? cents(item.amountToday.pixDiscount.cents)
                : null,
              vencimento: item.entry.due_date,
              situacao: BILLING_STATE_LABELS[item.state],
              aviso_de_hoje: item.dueStep ? describeStep(item.dueStep.step) : null,
              proximo_aviso: item.nextStep
                ? `${describeStep(item.nextStep.step)} em ${item.nextStep.date}`
                : null,
              ultimo_aviso: last
                ? `${describeStep(last.step)}: ${BILLING_MESSAGE_STATUS_LABELS[last.status]} ` +
                  `em ${last.created_at.slice(0, 10)}`
                : null,
              abriu_a_pagina_em: item.billing.last_viewed_at,
              clicou_em_pagar_em: item.billing.checkout_clicked_at,
              link: item.url,
            }
          }),
        }
      },
    }),

    ver_mensalidades: tool({
      description:
        'Mensalidades: o valor que um cliente paga todo mês, gerado como lançamento com cobrança ' +
        'alguns dias antes de cada vencimento. Situação, dia, próximo vencimento e quantos meses ' +
        'já foram gerados.',
      inputSchema: z.object({
        cliente_id: z.string().uuid().optional(),
        limite: limitSchema,
      }),
      execute: async (input) => {
        let items
        try {
          items = await listSeries(supabase)
        } catch (error) {
          return failure('as mensalidades', error)
        }
        const matching = items.filter(
          (item) => !input.cliente_id || item.series.client_id === input.cliente_id,
        )
        return {
          encontradas: matching.length,
          mensalidades: matching.slice(0, input.limite ?? MAX_RESULTS).map((item) => ({
            id: item.series.id,
            cliente: item.clientName,
            descricao: item.series.description,
            valor: Number(item.series.amount),
            dia_do_vencimento: Number(item.series.start_date.slice(8, 10)),
            termina_em: item.series.end_date,
            situacao: BILLING_SERIES_STATE_LABELS[item.state],
            proximo_vencimento: item.nextDueDate,
            meses_gerados: item.generatedCount,
            lembretes: item.series.reminders_enabled,
          })),
        }
      },
    }),
  }
}
