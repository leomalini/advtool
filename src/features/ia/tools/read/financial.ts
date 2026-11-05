import { tool } from 'ai'
import { z } from 'zod'
import {
  FINANCIAL_CATEGORY_LABELS,
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_TYPE_LABELS,
  SUCCESS_FEE_STAGE_LABELS,
  estimatedFee,
  getSuccessFeeStage,
  isToAssess,
} from '@/types/financialEntry.types'
import type {
  FinancialEntry,
  FinancialEntryCategory,
  FinancialEntryStatus,
  FinancialEntryType,
} from '@/types/financialEntry.types'
import { clientLabel, dateSchema, limitSchema, toolError, type ToolClient } from '../shared'

const SELECT =
  'id, type, category, description, amount, status, settlement_kind, due_date, paid_at, ' +
  'condition_description, percent, base_description, base_amount, estimated_base_amount, ' +
  'client:clients(type, name, company_name, trade_name), ' +
  'legal_process:legal_processes(cnj_number)'

export function createFinancialTools(supabase: ToolClient) {
  return {
    listar_lancamentos: tool({
      description:
        'Lançamentos financeiros (receitas e despesas): honorários, êxitos, custas etc. Quem não ' +
        'tem acesso ao Financeiro recebe lista vazia — nesse caso diga que o acesso não está ' +
        'liberado. Para os êxitos, use categoria "exito"; com so_a_apurar, só os que esperam o ' +
        'valor da base: esses ficam em R$ 0, e a estimativa não é dinheiro a receber.',
      inputSchema: z.object({
        tipo: z.enum(['receita', 'despesa']).optional(),
        categoria: z.enum(['honorario', 'exito', 'custas', 'pericia', 'outros']).optional(),
        status: z.enum(['pendente', 'pago']).optional(),
        so_a_apurar: z.boolean().optional().describe('Só percentuais sem o valor da base.'),
        vence_de: dateSchema.optional(),
        vence_ate: dateSchema.optional(),
        cliente_id: z.string().uuid().optional(),
        processo_id: z.string().uuid().optional(),
        limite: limitSchema,
      }),
      execute: async (input) => {
        let query = supabase
          .from('financial_entries')
          .select(SELECT)
          .order('due_date', { ascending: false, nullsFirst: true })
          .limit(input.limite ?? 10)

        if (input.tipo) query = query.eq('type', input.tipo)
        if (input.categoria) query = query.eq('category', input.categoria)
        if (input.status) query = query.eq('status', input.status)
        if (input.so_a_apurar) query = query.not('percent', 'is', null).is('base_amount', null)
        if (input.vence_de) query = query.gte('due_date', input.vence_de)
        if (input.vence_ate) query = query.lte('due_date', input.vence_ate)
        if (input.cliente_id) query = query.eq('client_id', input.cliente_id)
        if (input.processo_id) query = query.eq('legal_process_id', input.processo_id)

        const { data, error } = await query
        if (error) return toolError('o financeiro', error)

        const rows = (data ?? []) as unknown as Array<
          Pick<
            FinancialEntry,
            | 'settlement_kind'
            | 'percent'
            | 'base_description'
            | 'base_amount'
            | 'estimated_base_amount'
          > & {
            id: string
            type: FinancialEntryType
            category: FinancialEntryCategory
            description: string
            amount: number
            status: FinancialEntryStatus
            due_date: string | null
            paid_at: string | null
            condition_description: string | null
            client: Parameters<typeof clientLabel>[0]
            legal_process: { cnj_number: string | null } | null
          }
        >

        const total = rows.reduce(
          (sum, r) => sum + (r.type === 'receita' ? r.amount : -r.amount),
          0,
        )

        return {
          saldo_dos_listados: total,
          lancamentos: rows.map((r) => ({
            id: r.id,
            tipo: FINANCIAL_TYPE_LABELS[r.type] ?? r.type,
            categoria: FINANCIAL_CATEGORY_LABELS[r.category] ?? r.category,
            descricao: r.description,
            // A success fee to assess has no amount yet: R$ 0 would read as nothing.
            valor: isToAssess(r) ? null : r.amount,
            status: FINANCIAL_STATUS_LABELS[r.status] ?? r.status,
            vencimento: r.due_date,
            condicao: r.condition_description,
            pago_em: r.paid_at,
            cliente: clientLabel(r.client),
            processo_cnj: r.legal_process?.cnj_number ?? null,
            percentual: r.percent,
            base: r.base_description,
            valor_da_base: r.base_amount,
            base_estimada: r.estimated_base_amount,
            honorario_estimado: estimatedFee(r),
            situacao_do_exito:
              r.category === 'exito' ? SUCCESS_FEE_STAGE_LABELS[getSuccessFeeStage(r)] : null,
          })),
        }
      },
    }),
  }
}
