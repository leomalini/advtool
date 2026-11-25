/**
 * Campo de percentual digitado (multa, juros, desconto): '' é sem, aceita
 * vírgula, até duas casas. 0 também é sem — a coluna guarda null.
 */
export function parsePercentInput(raw: string, max: number): number | null | 'invalid' {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > max) return 'invalid'
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return 'invalid'
  return value === 0 ? null : value
}

/** O valor guardado de volta no campo: 2.5 → "2,5"; null → "". */
export function percentToInput(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}
