/**
 * Reais → centavos, a unidade da API da InfinitePay (R$ 10,00 = 1000).
 *
 * Pela representação decimal, e não por `amount * 100`: `0.29 * 100` dá
 * 28.999999999999996. `Math.round` acertaria este caso, mas a conta exata não
 * depende de lembrar de arredondar.
 *
 * `amount` vem de `financial_entries.amount`, `numeric(12,2)`, que o PostgREST
 * devolve como number — no máximo duas casas, então `toFixed(2)` não arredonda
 * nada.
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Valor inválido para cobrança: ${amount}`)
  }
  const [reais, centavos] = amount.toFixed(2).split('.')
  return Number(reais) * 100 + Number(centavos)
}
