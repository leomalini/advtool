import type { Profile } from './common.types'

export type FinancialEntryType = 'receita' | 'despesa'
export type FinancialEntryCategory = 'honorario' | 'custas' | 'pericia' | 'outros'
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

export const FINANCIAL_CATEGORY_LABELS: Record<FinancialEntryCategory, string> = {
  honorario: 'Honorário',
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

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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
