import {
  getCashFlowDate,
  getFinancialSituation,
  todayISO,
  type FinancialEntryWithRelations,
  type FinancialEntryType,
  type FinancialSituation,
} from '@/types/financialEntry.types'
import { getClientDisplayName } from '@/types/cliente.types'

/**
 * As quatro situações da taxonomia, mais o guarda-chuva `a_receber` — que é
 * "TUDO que ainda não foi pago", a soma dos outros três. Ele existe como opção
 * de filtro para o card "A receber" ter para onde levar ao ser clicado.
 */
export type FinancialSituationFilter = FinancialSituation | 'a_receber'

export const FINANCIAL_SITUATION_FILTER_LABELS: Record<FinancialSituationFilter, string> = {
  a_receber: 'A receber (tudo)',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  condicao_especial: 'Condição especial',
  pago: 'Pago',
}

export interface FinancialFilters {
  search: string
  type: FinancialEntryType | null
  situation: FinancialSituationFilter | null
  clientId: string | null
  legalProcessId: string | null
  /**
   * Período, ISO (yyyy-mm-dd), inclusivo, pela data de fluxo de caixa
   * (getCashFlowDate): o pago conta pelo pagamento, o resto pelo vencimento.
   * É o critério do gráfico — por isso o clique numa coluna preenche estes
   * dois campos e a tabela mostra exatamente o que a coluna somou.
   */
  periodFrom: string | null
  periodTo: string | null
  /**
   * Só os lançamentos sem data nenhuma — o recorte da coluna "Sem data" do
   * gráfico. Precisa ser um filtro próprio: "sem data" é um subconjunto
   * estrito de "condição especial" (que pode ter previsão), e um intervalo em
   * periodFrom/periodTo não consegue expressar "ausência de".
   */
  undatedOnly: boolean
}

export const emptyFinancialFilters: FinancialFilters = {
  search: '',
  type: null,
  situation: null,
  clientId: null,
  legalProcessId: null,
  periodFrom: null,
  periodTo: null,
  undatedOnly: false,
}

export function hasActiveFinancialFilters(f: FinancialFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.type !== null ||
    f.situation !== null ||
    f.clientId !== null ||
    f.legalProcessId !== null ||
    f.periodFrom !== null ||
    f.periodTo !== null ||
    f.undatedOnly
  )
}

export function countActiveFinancialFilters(f: FinancialFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.type !== null) n++
  if (f.situation !== null) n++
  if (f.clientId !== null) n++
  if (f.legalProcessId !== null) n++
  // Um período conta como um filtro só, mesmo com as duas pontas preenchidas.
  if (f.periodFrom !== null || f.periodTo !== null) n++
  if (f.undatedOnly) n++
  return n
}

/**
 * Mais recente primeiro, pela mesma data que a coluna "Data" da tabela mostra
 * (getCashFlowDate). O servidor ordena por vencimento, e um pagamento feito
 * fora do mês em que vencia aparecia fora de ordem. Sem data vai para o topo,
 * como no servidor (DUE_DATE_ORDER); empates mantêm a ordem que veio dele.
 */
export function sortByCashFlowDate(
  entries: FinancialEntryWithRelations[]
): FinancialEntryWithRelations[] {
  return [...entries].sort((a, b) => {
    const dateA = getCashFlowDate(a)
    const dateB = getCashFlowDate(b)
    if (dateA === dateB) return 0
    if (dateA === null) return -1
    if (dateB === null) return 1
    return dateA < dateB ? 1 : -1
  })
}

/** Primeiro e último dia de um mês 'yyyy-MM' — usado pelo clique no gráfico. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number)
  const last = new Date(year, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function filterFinancialEntries(
  entries: FinancialEntryWithRelations[],
  f: FinancialFilters
): FinancialEntryWithRelations[] {
  const q = f.search.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const today = todayISO()

  return entries.filter((e) => {
    if (f.type && e.type !== f.type) return false
    if (f.clientId && e.client_id !== f.clientId) return false
    if (f.legalProcessId && e.legal_process_id !== f.legalProcessId) return false

    // A data do gráfico, não o vencimento: um lançamento pago em setembro que
    // vencia em agosto está na coluna de setembro, e precisa estar aqui também.
    const cashFlowDate = getCashFlowDate(e)

    if (f.undatedOnly && cashFlowDate !== null) return false

    if (f.situation) {
      const situation = getFinancialSituation(e, today)
      // O guarda-chuva: tudo que não foi pago, seja com data ou por condição.
      if (f.situation === 'a_receber') {
        if (situation === 'pago') return false
      } else if (situation !== f.situation) {
        return false
      }
    }

    // Sem data não pertence a período nenhum. A comparação direta não serviria:
    // em JS `null < '2026-01-01'` é false, então um lançamento sem data
    // escaparia dos dois limites e apareceria em qualquer intervalo.
    if (f.periodFrom || f.periodTo) {
      if (cashFlowDate === null) return false
      if (f.periodFrom && cashFlowDate < f.periodFrom) return false
      if (f.periodTo && cashFlowDate > f.periodTo) return false
    }

    if (q) {
      const haystack = [
        e.description,
        e.condition_description,
        e.client ? getClientDisplayName(e.client as Parameters<typeof getClientDisplayName>[0]) : null,
        e.legal_process?.cnj_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesText = haystack.includes(q)
      const matchesDigits =
        qDigits.length > 0 &&
        (e.legal_process?.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

      if (!matchesText && !matchesDigits) return false
    }

    return true
  })
}
