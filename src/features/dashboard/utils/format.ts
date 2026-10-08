const countFormat = new Intl.NumberFormat('pt-BR')

/** Whole reais: on a dashboard tile the cents are noise, and the Financeiro
 * page has the exact amount one click away. */
const wholeCurrencyFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 1234 → '1.234'. */
export function formatCount(value: number): string {
  return countFormat.format(value)
}

/** 8399.5 → 'R$ 8.400'. */
export function formatWholeBRL(value: number): string {
  return wholeCurrencyFormat.format(value)
}

/** (1, 'entrega', 'entregas') → '1 entrega'; (1200, …) → '1.200 entregas'. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`
}
