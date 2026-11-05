import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import {
  formatCurrency,
  todayISO,
  type FinancialEntry,
  type FinancialEntryCategory,
  type FinancialEntryType,
  type FinancialSettlementKind,
} from '@/types/financialEntry.types'
import type { Contract, ContractKind } from '@/types/contract.types'
import { splitInstallments } from '@/features/financeiro/utils/installments'

/**
 * Os lançamentos que um contrato oferece ao ser assinado (docs/contratos.md →
 * Financeiro). Nada nasce sozinho: a prévia mostra estes rascunhos, a pessoa
 * ajusta e confirma.
 */

/** Do cliente com terceiros não lança nada: o dinheiro não é do escritório. */
const ENTRY_KIND: Partial<
  Record<ContractKind, { type: FinancialEntryType; category: FinancialEntryCategory }>
> = {
  honorarios: { type: 'receita', category: 'honorario' },
  escritorio: { type: 'despesa', category: 'outros' },
}

export function contractEntryKind(kind: ContractKind) {
  return ENTRY_KIND[kind] ?? null
}

type ContractForEntries = Pick<
  Contract,
  | 'id'
  | 'kind'
  | 'title'
  | 'client_id'
  | 'legal_process_id'
  | 'total_amount'
  | 'installments'
  | 'first_due_date'
  | 'success_fee_percent'
  | 'signed_at'
>

export interface ContractEntryDraft {
  /** Estável enquanto a prévia está aberta — a lista remove linhas. */
  key: string
  settlement_kind: FinancialSettlementKind
  description: string
  amount: number
  /** 'yyyy-MM-dd'; '' quando não há. */
  due_date: string
  condition_description: string
  /** The success fee's percentage (migration 89); `null` on an installment. */
  percent: number | null
  /** What the percentage is of; '' on an installment. */
  base_description: string
}

const DESCRIPTION_MAX = 300

/**
 * Parcelas mensais a partir do 1º vencimento (ou da assinatura, ou de hoje) e,
 * em honorários, o êxito a apurar: categoria Êxito, o percentual do contrato
 * sobre o proveito econômico, R$ 0 em condição especial até o valor da base
 * (docs/financeiro.md; a fase 4 de docs/contratos.md já não estimava: um
 * valor estimado inflaria o "A receber"). Os centavos que sobram da divisão
 * vão para a última parcela.
 */
export function buildContractEntryDrafts(contract: ContractForEntries): ContractEntryDraft[] {
  if (!contractEntryKind(contract.kind)) return []
  const drafts: ContractEntryDraft[] = []

  const total = contract.total_amount ?? 0
  if (Math.round(total * 100) > 0) {
    const count = Math.max(1, contract.installments ?? 1)
    const start = contract.first_due_date ?? contract.signed_at ?? todayISO()
    splitInstallments(total, count, start).forEach((installment, index) => {
      drafts.push({
        key: `parcela-${index}`,
        settlement_kind: 'scheduled',
        description: (count === 1
          ? contract.title
          : `${contract.title} — parcela ${index + 1}/${count}`
        ).slice(0, DESCRIPTION_MAX),
        amount: installment.amount,
        due_date: installment.due_date,
        condition_description: '',
        percent: null,
        base_description: '',
      })
    })
  }

  const percent = contract.success_fee_percent ?? 0
  if (contract.kind === 'honorarios' && percent > 0) {
    drafts.push({
      key: 'exito',
      settlement_kind: 'conditional',
      description: `${contract.title} — êxito`.slice(0, DESCRIPTION_MAX),
      amount: 0,
      due_date: '',
      condition_description: 'No êxito da ação',
      percent,
      base_description: 'o proveito econômico',
    })
  }

  return drafts
}

/** O que impede a linha de ser lançada — as mesmas regras do formulário do
 * Financeiro. O êxito fica a apurar: sem valor, mas com a base dita. */
export function contractEntryDraftError(draft: ContractEntryDraft): string | null {
  if (!draft.description.trim()) return 'Descreva o lançamento.'
  if (draft.percent !== null) {
    if (!draft.base_description.trim()) return 'Diga sobre o que incide o êxito.'
    if (!draft.condition_description.trim()) return 'Descreva a condição.'
    return null
  }
  if (draft.settlement_kind === 'scheduled') {
    if (!(draft.amount > 0)) return 'O valor deve ser maior que zero.'
    if (!draft.due_date) return 'Informe o vencimento.'
    return null
  }
  if (!(draft.amount >= 0)) return 'O valor não pode ser negativo.'
  if (!draft.condition_description.trim()) return 'Descreva a condição.'
  return null
}

export function contractEntryInputs(
  contract: ContractForEntries,
  drafts: ContractEntryDraft[]
): FinancialEntryInput[] {
  const kind = contractEntryKind(contract.kind)
  if (!kind) return []
  return drafts.map((draft) => {
    const entry: FinancialEntryInput = {
      ...kind,
      description: draft.description.trim(),
      amount: draft.amount,
      status: 'pendente',
      settlement_kind: draft.settlement_kind,
      due_date: draft.due_date || null,
      condition_description:
        draft.settlement_kind === 'conditional' ? draft.condition_description.trim() : null,
      client_id: contract.client_id,
      legal_process_id: contract.legal_process_id,
      contract_id: contract.id,
    }
    // The success fee goes in to assess: R$ 0, conditional, its own category.
    return draft.percent === null
      ? entry
      : {
          ...entry,
          category: 'exito',
          amount: 0,
          settlement_kind: 'conditional',
          percent: draft.percent,
          base_description: draft.base_description.trim(),
        }
  })
}

/**
 * Editar o contrato não reescreve lançamentos (decisão do plano). Quando os
 * números deixam de bater, a tela avisa — e a correção fica com o Financeiro.
 * Só conta as parcelas (com vencimento) do tipo que o contrato lança: um
 * lançamento avulso ligado ao contrato não é parcela.
 */
export function describeEntriesDivergence(
  contract: Pick<Contract, 'kind' | 'total_amount' | 'installments'>,
  entries: Pick<FinancialEntry, 'type' | 'category' | 'settlement_kind' | 'amount'>[]
): string | null {
  const kind = contractEntryKind(contract.kind)
  if (!kind || contract.total_amount === null) return null
  // A success fee assessed with a due date is scheduled too, and it is not an
  // installment of the contract's total.
  const installments = entries.filter(
    (entry) =>
      entry.type === kind.type &&
      entry.settlement_kind === 'scheduled' &&
      entry.category !== 'exito'
  )
  if (installments.length === 0) return null

  const launchedCents = installments.reduce(
    (sum, entry) => sum + Math.round(Number(entry.amount) * 100),
    0
  )
  const differences: string[] = []
  if (launchedCents !== Math.round(contract.total_amount * 100)) {
    const launched = formatCurrency(launchedCents / 100)
    differences.push(`${launched} lançados, ${formatCurrency(contract.total_amount)} no contrato`)
  }
  if (contract.installments && installments.length !== contract.installments) {
    const launched =
      installments.length === 1 ? '1 parcela lançada' : `${installments.length} parcelas lançadas`
    differences.push(`${launched}, ${contract.installments} no contrato`)
  }
  return differences.length > 0 ? differences.join('; ') : null
}
