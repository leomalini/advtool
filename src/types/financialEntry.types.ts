import type { Profile } from './common.types'
import type { PaymentChargeSummary } from './paymentCharge.types'

export type FinancialEntryType = 'receita' | 'despesa'
/** `exito` (migration 89): the success fee, which the Êxitos tab lists. */
export type FinancialEntryCategory = 'honorario' | 'exito' | 'custas' | 'pericia' | 'outros'
/** "Atrasado" não é um estado guardado — ver getFinancialSituation. */
export type FinancialEntryStatus = 'pendente' | 'pago'
/**
 * Como o lançamento é liquidado: numa data, ou ao cumprir uma condição.
 * É o ÚNICO critério de classificação — ausência de data não define nada
 * (ver a migration 40).
 */
export type FinancialSettlementKind = 'scheduled' | 'conditional'

export const FINANCIAL_TYPE_LABELS: Record<FinancialEntryType, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
}

/** In this order in the form's select: the success fee right after the fee. */
export const FINANCIAL_CATEGORY_LABELS: Record<FinancialEntryCategory, string> = {
  honorario: 'Honorário',
  exito: 'Êxito',
  custas: 'Custas',
  pericia: 'Perícia',
  outros: 'Outros',
}

export const FINANCIAL_STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
}

export const FINANCIAL_SETTLEMENT_KIND_LABELS: Record<FinancialSettlementKind, string> = {
  scheduled: 'Com vencimento',
  conditional: 'Condição especial',
}

export interface FinancialEntry {
  id: string
  type: FinancialEntryType
  category: FinancialEntryCategory
  description: string
  /** numeric(12,2) — PostgREST devolve como number. */
  amount: number
  status: FinancialEntryStatus
  settlement_kind: FinancialSettlementKind
  /** Vencimento quando 'scheduled'; previsão opcional quando 'conditional'. */
  due_date: string | null
  /** O que precisa acontecer — obrigatório quando 'conditional'. */
  condition_description: string | null
  paid_at: string | null
  client_id: string | null
  crm_item_id: string | null
  legal_process_id: string | null
  /** Contrato que originou o lançamento (migration 71). Editar o contrato não
   * reescreve o lançamento. */
  contract_id: string | null
  /** Percentage of `base_description` (migration 89). `null` = fixed amount. */
  percent: number | null
  /** What the percentage is of: "o proveito econômico". */
  base_description: string | null
  /** The base, once the event happens. `null` with a percentage = to assess:
   * R$ 0, pending, conditional. On an installment, the whole base. */
  base_amount: number | null
  /** An estimate of the base while to assess. It only informs: never summed
   * into "A receber". */
  estimated_base_amount: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface FinancialEntryWithRelations extends FinancialEntry {
  client?: {
    id: string
    type: 'individual' | 'company'
    name: string | null
    company_name: string | null
    trade_name: string | null
  } | null
  /** Resumo do processo vinculado — o suficiente para a coluna e o link. */
  legal_process?: {
    id: string
    cnj_number: string | null
  } | null
  /** Só os ids dos anexos: as listas mostram quantos são; o detalhe busca o
   * resto. */
  documents?: { id: string }[]
  /** Id e situação dos links de pagamento (migration 67): o ícone da linha e
   * as travas de valor e baixa. O detalhe busca o resto. */
  payment_charges?: PaymentChargeSummary[]
  creator?: Profile
}

// ── Situação: a taxonomia da tela ───────────────────────────────────────────

/**
 * Os quatro estados que o usuário enxerga. Os três primeiros são o que "A
 * receber" agrega:
 *
 *     A receber (TUDO) = A vencer + Vencido + Condição especial
 *
 * Nenhum deles é gravado: todos derivam de `status` + `settlement_kind` +
 * `due_date`, para que um lançamento não possa ficar preso num rótulo que
 * deixou de ser verdade.
 */
export type FinancialSituation = 'a_vencer' | 'vencido' | 'condicao_especial' | 'pago'

export const FINANCIAL_SITUATION_LABELS: Record<FinancialSituation, string> = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  condicao_especial: 'Condição especial',
  pago: 'Pago',
}

/**
 * Hoje em 'yyyy-MM-dd', montado a partir dos componentes LOCAIS.
 *
 * `toISOString().slice(0, 10)` converteria para UTC: em Brasília (UTC-3),
 * qualquer horário a partir das 21h já devolve o dia seguinte — e um
 * lançamento que vence hoje apareceria "Vencido" ao fim da tarde.
 */
export function todayISO(): string {
  return toISODate(new Date())
}

/** 'yyyy-MM-dd' a partir dos componentes locais de uma data. */
export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Fonte única da situação de um lançamento. Toda superfície — badge, filtro,
 * indicadores, gráfico — passa por aqui, para as três telas não divergirem.
 *
 * ⚠️ Condição especial ganha de vencido, de propósito. Uma previsão que passou
 * não é inadimplência: pintar de vermelho um "receber após o alvará" cuja
 * estimativa furou cobraria o cliente por um atraso que não é dele.
 */
export function getFinancialSituation(
  entry: Pick<FinancialEntry, 'status' | 'settlement_kind' | 'due_date'>,
  today: string = todayISO()
): FinancialSituation {
  if (entry.status === 'pago') return 'pago'
  if (entry.settlement_kind === 'conditional') return 'condicao_especial'
  return entry.due_date !== null && entry.due_date < today ? 'vencido' : 'a_vencer'
}

/**
 * A data que põe o lançamento num mês do fluxo de caixa: o que foi pago conta
 * pelo pagamento; o resto, pelo vencimento — ou pela previsão, na condição
 * especial. `null` para o que ainda não tem quando: condição especial sem
 * previsão.
 *
 * Fonte única do recorte por período. O gráfico, os indicadores do mês e o
 * filtro da tabela passam por aqui — antes o gráfico usava o pagamento e a
 * tabela o vencimento, e o clique num mês mostrava na tabela outros
 * lançamentos que não os somados na coluna.
 */
export function getCashFlowDate(
  entry: Pick<FinancialEntry, 'status' | 'due_date' | 'paid_at'>
): string | null {
  return entry.status === 'pago' ? (entry.paid_at ?? entry.due_date) : entry.due_date
}

/**
 * O êxito lançado de um contrato fica em R$ 0 até se saber o valor (migration
 * 71). Dar baixa nele assim gravaria um recebimento de zero: os botões de
 * baixa pedem o valor antes.
 */
export const ZERO_AMOUNT_PAYMENT_REASON =
  'Informe o valor recebido antes da baixa: edite o lançamento.'

export function needsAmountBeforePayment(
  entry: Pick<FinancialEntry, 'status' | 'amount'>
): boolean {
  return entry.status !== 'pago' && Number(entry.amount) === 0
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** "30%", "33,33%". */
export function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

// ── Êxitos e percentuais (migration 89) ─────────────────────────────────────

type PercentFields = Partial<Pick<FinancialEntry, 'percent' | 'base_amount'>>

/**
 * A percentage whose base is not known yet — R$ 0, pending, conditional (a
 * CHECK of migration 89). Rows read without the columns count as not.
 */
export function isToAssess(entry: PercentFields): boolean {
  return (entry.percent ?? null) !== null && (entry.base_amount ?? null) === null
}

/** The fee a base yields, rounded to the cent: 30% of 80.000,00 = 24.000,00. */
export function feeFromBase(baseAmount: number, percent: number): number {
  return Math.round((Math.round(baseAmount * 100) * percent) / 100) / 100
}

/** "30% sobre o proveito econômico" — the base as typed, after "sobre", so no
 * article has to be guessed. `null` for a fixed amount, and for a row read
 * from a database still without migration 89, where the column is undefined. */
export function describePercentage(
  entry: Pick<FinancialEntry, 'percent' | 'base_description'>
): string | null {
  const percent = entry.percent ?? null
  if (percent === null) return null
  return `${formatPercent(percent)} sobre ${entry.base_description ?? 'a base'}`
}

/**
 * Where a success fee stands — the Êxitos tab's taxonomy. Derived from the
 * situation, as everything here: "aguardando" is a condition with a known
 * amount, "a apurar" one still without it.
 */
export type SuccessFeeStage = 'a_apurar' | 'aguardando' | 'a_vencer' | 'vencido' | 'recebido'

export const SUCCESS_FEE_STAGE_LABELS: Record<SuccessFeeStage, string> = {
  a_apurar: 'A apurar',
  aguardando: 'Aguardando',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  recebido: 'Recebido',
}

export function getSuccessFeeStage(
  entry: Pick<FinancialEntry, 'status' | 'settlement_kind' | 'due_date'> & PercentFields,
  today: string = todayISO()
): SuccessFeeStage {
  const situation = getFinancialSituation(entry, today)
  switch (situation) {
    case 'pago':
      return 'recebido'
    case 'condicao_especial':
      return isToAssess(entry) ? 'a_apurar' : 'aguardando'
    default:
      return situation
  }
}

/** The fee the estimated base would yield — what the Êxitos tab adds up apart
 * from "A receber". `null` without an estimate. */
export function estimatedFee(
  entry: Pick<FinancialEntry, 'percent' | 'estimated_base_amount'>
): number | null {
  const percent = entry.percent ?? null
  const estimate = entry.estimated_base_amount ?? null
  if (percent === null || estimate === null) return null
  return feeFromBase(estimate, percent)
}

/**
 * The line under a percentage entry's description, the same on every list:
 * "30% sobre o proveito econômico · a apurar · est. R$ 24.000,00", or, once
 * assessed, "… · base R$ 80.000,00". `null` for a fixed amount.
 */
export function describePercentageNote(
  entry: Pick<
    FinancialEntry,
    'percent' | 'base_description' | 'base_amount' | 'estimated_base_amount'
  >
): string | null {
  const percentage = describePercentage(entry)
  if (percentage === null) return null
  if (entry.base_amount !== null) return `${percentage} · base ${formatCurrency(entry.base_amount)}`
  const estimate = estimatedFee(entry)
  return estimate === null
    ? `${percentage} · a apurar`
    : `${percentage} · a apurar · est. ${formatCurrency(estimate)}`
}

/** Marking it paid needs the base first — the click opens "Apurar" instead. */
export const ASSESS_BEFORE_PAYMENT_REASON =
  'Êxito a apurar: informe o valor da base em "Apurar" antes da baixa.'

/** Texto do diálogo de exclusão. Os anexos saem junto (migration 63), e isso
 * precisa estar escrito antes do clique. */
export function describeEntryDeletion(
  entry: Pick<FinancialEntryWithRelations, 'description' | 'documents'>
): string {
  const count = entry.documents?.length ?? 0
  const attachments =
    count === 0
      ? ''
      : count === 1
        ? ', junto com o documento anexado'
        : `, junto com os ${count} documentos anexados`
  return `"${entry.description}" será removido permanentemente${attachments}.`
}
